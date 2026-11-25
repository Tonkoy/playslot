'use client';

import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useToast } from './Toast';

/**
 * Requests nobody is waiting on: the session check, the small account extras
 * in the layout, and the calendar's per-day counts. They never show a loader.
 */
const SILENT_QUERIES = new Set(['me', 'myStanding', 'pushConfig', 'availabilitySummary']);

/** The thin bar at the very top: any work at all, after this beat. */
const BAR_AFTER_MS = 80;
/**
 * The blurred veil: only for waits long enough to be felt. Shorter ones show
 * the bar alone — the veil arriving just as the page was ready, then lingering,
 * was the "page → blur → page" flash.
 */
const VEIL_AFTER_MS = 400;
/**
 * Both hide only after the app has been idle this long. A page often loads in
 * steps (the route, then its data) with a few milliseconds between them;
 * without the pause the loader hid and came back at every step.
 */
const HIDE_AFTER_IDLE_MS = 250;
/** Once shown, stay at least this long — a blink is worse than a beat. */
const MIN_VISIBLE_MS = 300;
/**
 * A wait that runs past this is not a load any more, it is a problem: lift the
 * veil so the page can be used, and say so. (Requests themselves time out at
 * 20 s in lib/api.ts.)
 */
const MAX_VISIBLE_MS = 10_000;

/**
 * One global loader for the whole app. It needs no wiring from any screen: it
 * watches React Query's counters of requests in flight, and the site's own link
 * clicks for page navigations (a server-rendered page makes no client request,
 * so without this, opening a club showed nothing until the new page arrived).
 *
 * Two layers:
 *  - the bar, at the very top above the header and any dialog: every read,
 *    write and navigation, including refreshes of data already on screen;
 *  - the veil (blur + "Зареждане…"): first loads, writes and navigations that
 *    take longer than VEIL_AFTER_MS. It sits under the header, so the menu is
 *    never blurred, and under dialogs, which show their own pending state.
 *
 * Reads and navigations leave the page clickable under the veil; writes block
 * it, because a second click would submit twice.
 */
export function GlobalLoader() {
  const t = useTranslations('Common');
  const toast = useToast();

  // Anything in flight that someone is waiting on.
  const fetching = useIsFetching({
    predicate: (q) => q.state.fetchStatus === 'fetching' && !SILENT_QUERIES.has(String(q.queryKey[0])),
  });
  // First loads only: nothing to show yet, and not a retry after a failure.
  const firstLoads = useIsFetching({
    predicate: (q) =>
      q.state.status === 'pending' &&
      q.state.fetchStatus === 'fetching' &&
      q.state.fetchFailureCount === 0 &&
      !SILENT_QUERIES.has(String(q.queryKey[0])),
  });
  const mutating = useIsMutating();
  const [navigating, setNavigating] = useState(false);

  // Start on a click of one of the site's own links; the route listener below
  // ends it when the new page is in place.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as Element | null;
      const a = target?.closest?.('a');
      if (!a || !a.href || a.hasAttribute('download')) return;
      // A control inside the link (e.g. the photo zoom inside a coach card)
      // handles the click itself; the link is not followed.
      const control = target?.closest?.('button, [role="button"]');
      if (control && a.contains(control)) return;
      if (a.target && a.target !== '_self') return;
      const to = new URL(a.href, window.location.href);
      if (to.origin !== window.location.origin) return;
      // Same page (or only its #fragment): nothing will load.
      if (to.pathname === window.location.pathname && to.search === window.location.search) return;
      setNavigating(true);
    };
    // Capture phase, before any handler runs: Next's <Link> cancels the
    // browser's default navigation to route on the client, so whether the
    // click was cancelled says nothing here.
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, []);

  const barBusy = fetching + mutating > 0 || navigating;
  const veilBusy = firstLoads + mutating > 0 || navigating;
  const bar = useSettled(barBusy, BAR_AFTER_MS);
  const veil = useSettled(veilBusy, VEIL_AFTER_MS);

  // Safety valve: never hold the page hostage. The message goes through a ref
  // so a re-render doesn't restart the countdown.
  const slowMessage = useRef(() => toast(t('slowRequest'), 'error'));
  slowMessage.current = () => toast(t('slowRequest'), 'error');
  useEffect(() => {
    if (!veil.visible) return;
    const id = setTimeout(() => {
      veil.giveUp();
      setNavigating(false);
      slowMessage.current();
    }, MAX_VISIBLE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veil.visible]);

  return (
    <>
      <Suspense fallback={null}>
        <RouteChangeListener onChange={() => setNavigating(false)} />
      </Suspense>

      {bar.visible && (
        <div aria-hidden="true" style={barTrack}>
          <span className="loader-bar" style={barFill} />
        </div>
      )}

      {veil.visible && (
        <div
          role="status"
          aria-live="polite"
          aria-label={t('loading')}
          style={{ ...overlay, pointerEvents: mutating > 0 ? 'auto' : 'none' }}
        >
          <div style={panel}>
            <span className="loader-spinner" aria-hidden="true" style={spinner} />
            <span style={{ fontWeight: 600 }}>{t('loading')}</span>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * `busy` turned into something calm enough to show: appears after `showAfter`,
 * stays at least MIN_VISIBLE_MS, and leaves only after HIDE_AFTER_IDLE_MS of
 * real idleness. `giveUp()` hides it until the app is idle again.
 */
function useSettled(busy: boolean, showAfter: number) {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);
  const gaveUp = useRef(false);

  useEffect(() => {
    if (busy) {
      if (visible || gaveUp.current) return;
      const id = setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, showAfter);
      return () => clearTimeout(id);
    }
    gaveUp.current = false;
    if (!visible) return;
    const shownFor = Date.now() - shownAt.current;
    const id = setTimeout(() => setVisible(false), Math.max(HIDE_AFTER_IDLE_MS, MIN_VISIBLE_MS - shownFor));
    return () => clearTimeout(id);
  }, [busy, visible, showAfter]);

  return {
    visible,
    giveUp: () => {
      gaveUp.current = true;
      setVisible(false);
    },
  };
}

/** Calls `onChange` whenever the URL (path or query) changes after the first render. */
function RouteChangeListener({ onChange }: { onChange: () => void }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const first = useRef(true);
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    cb.current();
  }, [pathname, search]);
  return null;
}

const barTrack: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  height: 3,
  background: 'color-mix(in srgb, var(--green) 14%, transparent)',
  overflow: 'hidden',
  // Above everything — the header, dialogs, toasts. It is 3px tall and lets
  // clicks through, so it can never hide or block anything.
  zIndex: 2000,
  pointerEvents: 'none',
};
const barFill: React.CSSProperties = {
  display: 'block',
  height: '100%',
  width: '40%',
  background: 'linear-gradient(90deg, var(--green), var(--lime))',
  borderRadius: 3,
};
const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(247, 250, 248, 0.5)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
  display: 'grid',
  placeItems: 'center',
  // Under the site header (300) so navigation stays sharp, and under dialogs
  // (400), which show their own pending state.
  zIndex: 200,
};
const panel: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 12,
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--pill)',
  boxShadow: 'var(--shadow)',
  padding: '12px 20px',
  color: 'var(--ink)',
  fontSize: 14,
};
const spinner: React.CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: '50%',
  border: '2px solid var(--line-2)',
  borderTopColor: 'var(--green)',
  display: 'inline-block',
};
