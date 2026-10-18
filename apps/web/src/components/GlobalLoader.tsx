'use client';

import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useToast } from './Toast';

/** Activity this short never shows the loader at all (cache hits, instant replies). */
const SHOW_AFTER_MS = 150;
/**
 * The loader hides only after the app has been completely idle this long.
 * A page often loads in steps — session, then profile, then the coach's clubs,
 * then availability — with a few milliseconds between one request ending and
 * the next starting. Without this pause the loader hid and reappeared at every
 * step; with it, the whole chain reads as one load.
 */
const HIDE_AFTER_IDLE_MS = 350;
/** Once shown, stay at least this long — a blink is worse than a beat. */
const MIN_VISIBLE_MS = 450;
/**
 * A load that runs past this is not a load any more, it is a problem: lift
 * the veil so the page can be used, and say so. (Requests themselves time out
 * at 20 s in lib/api.ts.)
 */
const MAX_VISIBLE_MS = 10_000;

/**
 * One global loader for the whole app, driven by React Query's own counters
 * of in-flight requests (useIsFetching + useIsMutating), so no screen wires
 * anything up.
 *
 * It answers one question — "is the app still working on something you are
 * waiting for?" It appears once when work starts, stays through every
 * follow-up request, and leaves only when all of them have finished and
 * nothing new has started for a moment.
 *
 * What counts: first loads (a query with nothing to show yet) and writes.
 * What doesn't: refreshes of data already on screen — for example the club
 * grid updating because someone else just booked. Blurring a page someone is
 * using, or an open dialog, for a refresh they didn't ask for is worse than
 * the refresh being silent.
 *
 * Reads leave the page clickable underneath; writes block it, because a
 * second click would submit twice. The site header sits above the overlay
 * (SiteHeader, z-index 300), so navigation is never blurred.
 */
export function GlobalLoader() {
  const t = useTranslations('Common');
  const toast = useToast();
  // First loads only: status 'pending' is "no data and no error yet"; a query
  // being retried after a failure is still pending, so the failure count rules
  // those out — a failing request must not hold the veil up.
  const loading = useIsFetching({
    predicate: (q) =>
      q.state.status === 'pending' &&
      q.state.fetchStatus === 'fetching' &&
      q.state.fetchFailureCount === 0,
  });
  const mutating = useIsMutating();
  const busy = loading + mutating > 0;

  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);
  // Set when the safety valve below lifts the veil: the same stuck load must
  // not bring it straight back. Cleared once the app is idle again.
  const gaveUp = useRef(false);

  useEffect(() => {
    if (busy) {
      // Work started (or continues): show after a short beat, unless already up.
      if (visible || gaveUp.current) return;
      const id = setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, SHOW_AFTER_MS);
      return () => clearTimeout(id);
    }
    // Everything finished: wait for real idleness, and keep a minimum on-screen
    // time, before hiding. Any new request in the meantime cancels this.
    gaveUp.current = false;
    if (!visible) return;
    const shownFor = Date.now() - shownAt.current;
    const wait = Math.max(HIDE_AFTER_IDLE_MS, MIN_VISIBLE_MS - shownFor);
    const id = setTimeout(() => setVisible(false), wait);
    return () => clearTimeout(id);
  }, [busy, visible]);

  // Safety valve: never hold the page hostage. The message goes through a ref
  // so a re-render doesn't restart the countdown.
  const slowMessage = useRef(() => toast(t('slowRequest'), 'error'));
  slowMessage.current = () => toast(t('slowRequest'), 'error');
  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(() => {
      gaveUp.current = true;
      setVisible(false);
      slowMessage.current();
    }, MAX_VISIBLE_MS);
    return () => clearTimeout(id);
  }, [visible]);

  return (
    <>
      {visible && (
        <div aria-hidden="true" style={barTrack}>
          <span className="loader-bar" style={barFill} />
        </div>
      )}

      {visible && (
        <div
          role="status"
          aria-live="polite"
          aria-label={t('loading')}
          style={{
            ...overlay,
            pointerEvents: mutating > 0 ? 'auto' : 'none',
          }}
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

const barTrack: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  height: 3,
  background: 'transparent',
  overflow: 'hidden',
  zIndex: 100,
  pointerEvents: 'none',
};
const barFill: React.CSSProperties = {
  display: 'block',
  height: '100%',
  width: '40%',
  background: 'linear-gradient(90deg, transparent, var(--teal), var(--lime))',
};
const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(247, 250, 248, 0.5)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
  display: 'grid',
  placeItems: 'center',
  // Over the whole page and any open modal (50) — one veil, not a per-component
  // spinner. Only the site header (300) sits above it, so navigation stays sharp.
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
