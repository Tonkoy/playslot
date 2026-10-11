'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

/**
 * Accessible centered modal: backdrop click + Esc to close, aria-modal, focus
 * moved to the dialog, and scroll locked while open. Theme-aware.
 */
export function Modal({
  open,
  onClose,
  title,
  centerTitle = false,
  maxWidth = 480,
  maxHeightVh = 88,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Center the title instead of the default left alignment. */
  centerTitle?: boolean;
  /** Dialog width cap in px. Default matches the original compact modals. */
  maxWidth?: number;
  /** Dialog height cap in vh. Default matches the original compact modals. */
  maxHeightVh?: number;
  children: React.ReactNode;
}) {
  const c = useTranslations('Common');
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Callers pass an inline `onClose`, so it is a new function on every parent
  // render. Keeping it in a ref keeps the effect below tied to `open` alone —
  // otherwise every keystroke inside the dialog re-ran the effect and pulled
  // focus back to the dialog container, truncating what the user typed.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Runs once per open/close transition: Esc to close, scroll lock, focus in
  // on open and back to the trigger on close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      restoreFocusRef.current?.focus();
    };
  }, [open]);

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
          maxWidth,
          maxHeight: `${maxHeightVh}vh`,
          overflowY: 'auto',
          padding: 20,
          outline: 'none',
          position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={c('close')}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 32,
            height: 32,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            border: '1px solid var(--line-2)',
            background: 'var(--surface)',
            color: 'var(--ink-2)',
            fontSize: 16,
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >
          ×
        </button>
        {title && (
          <h3
            style={{
              fontWeight: 700,
              marginBottom: 12,
              fontSize: 18,
              textAlign: centerTitle ? 'center' : 'left',
              paddingRight: 36,
              paddingLeft: centerTitle ? 36 : 0,
            }}
          >
            {title}
          </h3>
        )}
        {children}
      </div>
    </div>
  );
}
