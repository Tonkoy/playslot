'use client';

import { useEffect, useRef } from 'react';

/**
 * Accessible centered modal: backdrop click + Esc to close, aria-modal, focus
 * moved to the dialog, and scroll locked while open. Theme-aware.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 0,
        zIndex: 50,
      }}
      className="modal-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="modal-card"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          boxShadow: 'var(--shadow)',
          width: '100%',
          maxWidth: 480,
          maxHeight: '88vh',
          overflowY: 'auto',
          padding: 20,
          outline: 'none',
        }}
      >
        {title && (
          <h3 style={{ fontWeight: 700, marginBottom: 12, fontSize: 18 }}>{title}</h3>
        )}
        {children}
      </div>
    </div>
  );
}
