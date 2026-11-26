/**
 * Shared "inner page" header: big heading + optional subtitle. No badge above
 * the heading — the logo in the bar already says which site this is.
 */
export function PageHeader({
  title,
  subtitle,
  align = 'left',
}: {
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
      <h1 style={{ fontSize: 'clamp(28px, 4.5vw, 44px)', fontWeight: 800, margin: 0 }}>{title}</h1>
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
