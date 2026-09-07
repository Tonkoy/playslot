'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

type ToastVariant = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

const ToastContext = createContext<(message: string, variant?: ToastVariant) => void>(() => {});

/** App-wide toast notifications. Auto-dismiss, stacked bottom-center, theme-aware. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const toast = useCallback((message: string, variant: ToastVariant = 'success') => {
    const id = nextId.current++;
    setToasts((cur) => [...cur, { id, message, variant }]);
    setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), 4000);
  }, []);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: 'fixed',
          left: '50%',
          bottom: 24,
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          zIndex: 1000,
          width: 'min(92vw, 420px)',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((tst) => (
          <div
            key={tst.id}
            role="status"
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'var(--surface)',
              border: `1px solid ${BORDER[tst.variant]}`,
              borderLeft: `4px solid ${BORDER[tst.variant]}`,
              color: 'var(--ink)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px 16px',
              boxShadow: 'var(--shadow)',
              animation: 'toast-in 160ms ease-out',
            }}
          >
            <span aria-hidden style={{ color: BORDER[tst.variant], fontWeight: 800 }}>
              {ICON[tst.variant]}
            </span>
            <span style={{ fontSize: 14 }}>{tst.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const BORDER: Record<ToastVariant, string> = {
  success: 'var(--free)',
  error: 'var(--clay)',
  info: 'var(--teal)',
};
const ICON: Record<ToastVariant, string> = { success: '✓', error: '!', info: 'i' };
