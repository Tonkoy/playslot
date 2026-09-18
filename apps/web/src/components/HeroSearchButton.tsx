'use client';

import { useSearchModal } from './SearchModalContext';

/** Client wrapper so the (server-rendered) homepage hero can open the shared search modal. */
export function HeroSearchButton({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const { openModal } = useSearchModal();
  return (
    <button type="button" onClick={openModal} style={style}>
      {children}
    </button>
  );
}
