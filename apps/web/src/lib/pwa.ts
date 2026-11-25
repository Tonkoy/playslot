'use client';

import { useSyncExternalStore } from 'react';

/** Chrome's install prompt event (not in the DOM typings). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// The browser fires `beforeinstallprompt` once, early — long before any
// "install" button is on screen. It is caught here, app-wide, and kept.
let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

let started = false;
/** Start listening for the install prompt and register the service worker. Idempotent. */
export function startPwa() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // no browser mini-bar; we offer our own button
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    emit();
  });
  // Production only: in development a service worker gets in the way of reloads.
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    const register = () =>
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* installability and push simply stay off */
      });
    // This usually runs after the page has loaded (it is called from an
    // effect), when a `load` listener would never fire.
    if (document.readyState === 'complete') void register();
    else window.addEventListener('load', register, { once: true });
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's own flag for "opened from the home screen".
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; the touch points give it away.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export type InstallState = 'installed' | 'promptable' | 'ios' | 'manual';

/**
 * Where this browser stands on installing PlaySlot:
 *  - installed: already running from the home screen;
 *  - promptable: the browser will show its install dialog when asked (Android, desktop Chrome/Edge);
 *  - ios: iPhone/iPad — only by hand, via Share → Add to Home Screen;
 *  - manual: anything else — through the browser's own menu, if at all.
 */
export function useInstallState(): { state: InstallState; install: () => Promise<boolean> } {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => (installed || isStandalone() ? 'installed' : deferred ? 'promptable' : isIos() ? 'ios' : 'manual'),
    () => 'manual' as const,
  );
  return {
    state: snapshot,
    install: async () => {
      if (!deferred) return false;
      await deferred.prompt();
      const choice = await deferred.userChoice;
      deferred = null;
      emit();
      return choice.outcome === 'accepted';
    },
  };
}
