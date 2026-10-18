'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { Me } from '@/lib/api';
import { GlobalLoader } from './GlobalLoader';
import { SearchModalHost } from './SearchModalHost';
import { SearchModalProvider } from './SearchModalContext';
import { ToastProvider } from './Toast';

/** App-wide client providers (TanStack Query for server-state caching, spec §3). */
export function Providers({
  children,
  initialSession,
}: {
  children: React.ReactNode;
  /**
   * The session as the server saw it for this request. Seeded into the cache
   * before the first render, so the menu, the role checks and every page that
   * asks "who is this" start from the real answer — no signed-out first paint,
   * no swap once the browser has asked.
   */
  initialSession?: { user: Me } | null;
}) {
  const [client] = useState(() => {
    const qc = new QueryClient({
      defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } },
    });
    if (initialSession) qc.setQueryData(['me'], initialSession);
    return qc;
  });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <SearchModalProvider>
          {children}
          <SearchModalHost />
          {/* Request feedback for the whole app (reads + writes). */}
          <GlobalLoader />
        </SearchModalProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
