/**
 * Shared "inner page" header: eyebrow label + big heading + optional subtitle,
 * echoing the homepage hero's visual language so every page in the app reads
 * as the same product, not just the homepage.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  align = 'left',
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
}) {
  return (
    <div
      style={{
        textAlign: align,
        marginBottom: 28,
        paddingBottom: 24,
        borderBottom: '1px solid var(--line)',
      }}
    >
      <span
        className="mono"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--green)',
        }}
      >
        {eyebrow}
      </span>
      <h1 style={{ fontSize: 'clamp(28px, 4.5vw, 44px)', fontWeight: 800, margin: '12px 0 0' }}>{title}</h1>
      {subtitle && (
        <p
          style={{
            color: 'var(--ink-2)',
            fontSize: 16,
            margin: '10px 0 0',
            maxWidth: '58ch',
            marginLeft: align === 'center' ? 'auto' : 0,
            marginRight: align === 'center' ? 'auto' : 0,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
