/**
 * Loading placeholders. A skeleton keeps the page's shape while the data is on
 * its way, so the layout doesn't jump when it lands — and it reads as "almost
 * there", which a lone "…" never did.
 *
 * Server- and client-safe; the shimmer stops under reduced motion.
 */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 8,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className="skeleton"
      aria-hidden
      style={{ display: 'block', width, height, borderRadius: radius, ...style }}
    />
  );
}

/** A few card-shaped rows: lists of bookings, clubs, members, anything. */
export function SkeletonRows({ rows = 3, height = 64 }: { rows?: number; height?: number }) {
  return (
    <div aria-hidden style={{ display: 'grid', gap: 10 }}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={height} radius={14} />
      ))}
    </div>
  );
}

/** Paragraph-shaped lines, the last one short like real text. */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-hidden style={{ display: 'grid', gap: 8 }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </div>
  );
}
