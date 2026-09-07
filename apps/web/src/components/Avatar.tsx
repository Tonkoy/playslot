/**
 * Circular avatar: shows a photo when provided, otherwise up to two initials on
 * a deterministic tint derived from the name. Server- and client-safe.
 */
export function Avatar({
  name,
  photoUrl,
  size = 44,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  // Deterministic hue from the name so each person keeps a stable color.
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        display: 'inline-grid',
        placeItems: 'center',
        background: `hsl(${hash} 55% 88%)`,
        color: `hsl(${hash} 55% 28%)`,
        fontWeight: 800,
        fontSize: size * 0.4,
        lineHeight: 1,
        letterSpacing: '-0.02em',
      }}
    >
      {initials || '?'}
    </span>
  );
}
