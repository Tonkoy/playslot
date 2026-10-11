import { APP_NAME } from '@/lib/brand';

/**
 * Shared "inner page" header: the product badge + big heading + optional
 * subtitle, echoing the homepage hero's visual language so every page reads as
 * the same product. The badge is always the product name — it used to repeat
 * the heading ("// КЛУБОВЕ" above "Клубове"), which said nothing twice.
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
      <span
        className="mono"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.12em',
          color: 'var(--green)',
        }}
      >
        {APP_NAME}
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
