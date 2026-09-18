'use client';

import { createContext, useContext, useMemo, useState } from 'react';

type SearchModalContextValue = {
  open: boolean;
  openModal: () => void;
  closeModal: () => void;
};

const SearchModalContext = createContext<SearchModalContextValue | null>(null);

/**
 * Shares the "search availability" modal's open state between the nav's
 * search icon and any in-page CTA (e.g. the homepage hero's primary button),
 * so both can trigger the same modal without prop-drilling.
 */
export function SearchModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(
    () => ({ open, openModal: () => setOpen(true), closeModal: () => setOpen(false) }),
    [open],
  );
  return <SearchModalContext.Provider value={value}>{children}</SearchModalContext.Provider>;
}

export function useSearchModal() {
  const ctx = useContext(SearchModalContext);
  if (!ctx) throw new Error('useSearchModal must be used within a SearchModalProvider');
  return ctx;
}
