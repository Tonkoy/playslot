'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { SearchModalHost } from './SearchModalHost';
import { SearchModalProvider } from './SearchModalContext';
import { ToastProvider } from './Toast';

/** App-wide client providers (TanStack Query for server-state caching, spec §3). */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <SearchModalProvider>
          {children}
          <SearchModalHost />
        </SearchModalProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
