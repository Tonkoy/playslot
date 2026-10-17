'use client';

import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/** Don't flash for requests that finish quickly. */
const BAR_DELAY_MS = 250;
const OVERLAY_DELAY_MS = 400;
/**
 * A first load gets the overlay quickly — the page has nothing to show yet.
 * A refetch over content that is already on screen never gets it.
 */
const READ_OVERLAY_DELAY_MS = 150;

/** True once `active` has been on continuously for `delay` ms. */
function useDelayed(active: boolean, delay: number): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!active) {
      setOn(false);
      return;
    }
    const id = setTimeout(() => setOn(true), delay);
    return () => clearTimeout(id);
  }, [active, delay]);
  return on;
}

/**
 * App-wide request feedback, driven by React Query so every screen gets it
 * without wiring anything per page:
 *
 * - **first load** (a query fetching with nothing cached) → the blurred overlay
 *   over the content, because the page has nothing to show yet
 * - **refetch** (a query fetching over data already on screen) → the thin bar
 *   only. Blurring a page someone is reading or typing into is worse than the
 *   uncertainty it was meant to cure
 * - **writes** (mutations) → the same overlay, but it blocks input, because the
 *   result changes what's on screen and a second click would double-submit
 *
 * All of it waits a moment before appearing, so a fast request doesn't flash.
 */
export function GlobalLoader() {
  const t = useTranslations('Common');
  const fetching = useIsFetching() > 0;
  // Only queries that have nothing to show yet: the blur is for an empty
  // screen, not for a background refresh of one that is already filled.
  const coldFetching = useIsFetching({ predicate: (q) => q.state.data === undefined }) > 0;
  const mutating = useIsMutating() > 0;

  const showBar = useDelayed(fetching || mutating, BAR_DELAY_MS);
  const blocking = useDelayed(mutating, OVERLAY_DELAY_MS);
  const soft = useDelayed(coldFetching && !mutating, READ_OVERLAY_DELAY_MS);
  const showOverlay = blocking || soft;

  return (
    <>
      {showBar && (
        <div aria-hidden="true" style={barTrack}>
          <span className="loader-bar" style={barFill} />
        </div>
      )}

      {showOverlay && (
        <div
          role="status"
          aria-live="polite"
          aria-label={t('loading')}
          style={{
            ...overlay,
            // A read is still readable underneath and clicking through is
            // harmless; a write must not be clicked twice.
            background: blocking ? 'rgba(18, 24, 27, 0.26)' : 'rgba(247, 250, 248, 0.45)',
            pointerEvents: blocking ? 'auto' : 'none',
          }}
        >
          <div style={panel}>
            <span className="loader-spinner" aria-hidden="true" style={spinner} />
            <span style={{ fontWeight: 600 }}>{t('loading')}</span>
          </div>
        </div>
      )}

      {/* Screen readers get the quiet case too, without any visual noise. */}
      <span className="sr-only" role="status" aria-live="polite">
        {showBar && !showOverlay ? t('loading') : ''}
      </span>
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
  backdropFilter: 'blur(3px)',
  WebkitBackdropFilter: 'blur(3px)',
  display: 'grid',
  placeItems: 'center',
  // Above the site header (30) and any open modal (50): a request in flight
  // covers the whole page, not the part of it that happens to be loading.
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
