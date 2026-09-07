/**
 * The PlaySlot mark: a 2×2 grid of slots with one lit in the brand lime —
 * a court grid with a "free slot". Original artwork, per the legal rule.
 */
export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: 9,
        background: 'var(--brand-tile-bg)',
        border: '1px solid var(--brand-tile-ring)',
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 3,
        padding: 6,
      }}
    >
      <i style={{ borderRadius: 2, background: 'var(--brand-off)' }} />
      <i style={{ borderRadius: 2, background: 'var(--lime)' }} />
      <i style={{ borderRadius: 2, background: 'var(--brand-off)' }} />
      <i style={{ borderRadius: 2, background: 'var(--brand-off)' }} />
    </span>
  );
}
