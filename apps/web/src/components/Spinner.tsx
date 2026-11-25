/** A small inline spinner for buttons that are working (uses .loader-spinner). */
export function Spinner({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <span
      aria-hidden="true"
      className="loader-spinner"
      style={{
        display: 'inline-block',
        flex: 'none',
        width: size,
        height: size,
        borderRadius: '50%',
        border: `2px solid color-mix(in srgb, ${color} 25%, transparent)`,
        borderTopColor: color,
      }}
    />
  );
}

/** A button label that shows the spinner beside it while `busy`, keeping the words. */
export function BusyLabel({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {busy && <Spinner size={14} />}
      {children}
    </span>
  );
}
