'use client';

import { useSyncExternalStore } from 'react';

const never = () => () => {};

/**
 * False on the server and while the page hydrates, true from then on.
 *
 * For views drawn from "today" and "now": the server's clock (UTC) and the
 * visitor's can be on different days — in Sofia, every night between midnight
 * and 2–3 a.m. — and a page rendered for one day cannot be hydrated as the
 * other. Such a view shows its skeleton until it is in the browser.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(never, () => true, () => false);
}
