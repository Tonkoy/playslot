/* eslint-disable @next/next/no-img-element -- club photos are arbitrary remote
   URLs (each club's own host); next/image would need every one of those domains
   allow-listed, so a plain <img> is the honest choice here. */

/**
 * Court-lines mark, shown where a club has no photo of its own. Keeps the
 * grid even instead of leaving a hole, and stays on brand.
 */
export function CourtMark() {
  return (
    <svg viewBox="0 0 120 90" aria-hidden style={{ width: '62%', height: '62%', opacity: 0.55 }}>
      <rect x="10" y="8" width="100" height="74" fill="none" stroke="var(--green)" strokeWidth="2" />
      <line x1="10" y1="45" x2="110" y2="45" stroke="var(--green)" strokeWidth="2" strokeDasharray="2 6" />
      <rect x="28" y="22" width="64" height="46" fill="none" stroke="var(--green)" strokeWidth="1.5" />
      <line x1="60" y1="22" x2="60" y2="68" stroke="var(--green)" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * Small square club logo for list rows. `contain` keeps a wordmark whole; a
 * photo fits the square instead of being cropped.
 */
export function ClubThumb({ src, size = 48 }: { src: string | null; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--surface-2)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
      }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 5, boxSizing: 'border-box' }}
        />
      ) : (
        <CourtMark />
      )}
    </span>
  );
}
