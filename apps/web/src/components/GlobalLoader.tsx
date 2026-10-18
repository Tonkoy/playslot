'use client';

import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

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
 * One global loader for the whole app, driven by React Query's own counters
 * of in-flight requests (useIsFetching + useIsMutating), so no screen wires
 * anything up.
 *
 * It answers one question — "is the app still working?" — rather than "is
 * this particular request still running?". It appears once when work starts,
 * stays through every follow-up request, and leaves only when all of them have
 * finished and nothing new has started for a moment.
 *
 * Reads leave the page clickable underneath; writes block it, because a
 * second click would submit twice. The site header sits above the overlay
 * (SiteHeader, z-index 300), so navigation is never blurred.
 */
export function GlobalLoader() {
  const t = useTranslations('Common');
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const busy = fetching + mutating > 0;

  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    if (busy) {
      // Work started (or continues): show after a short beat, unless already up.
      if (visible) return;
      const id = setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, SHOW_AFTER_MS);
      return () => clearTimeout(id);
    }
    // Everything finished: wait for real idleness, and keep a minimum on-screen
    // time, before hiding. Any new request in the meantime cancels this.
    if (!visible) return;
    const shownFor = Date.now() - shownAt.current;
    const wait = Math.max(HIDE_AFTER_IDLE_MS, MIN_VISIBLE_MS - shownFor);
    const id = setTimeout(() => setVisible(false), wait);
    return () => clearTimeout(id);
  }, [busy, visible]);

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
