/**
 * The "×" of close buttons, drawn rather than typed: the × character sits
 * low and off-centre in most fonts, so a round button never looks centred
 * around it. A drawn cross is centred exactly.
 */
export function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
      style={{ display: 'block', flexShrink: 0 }}
    >
      <path d="M3 3l8 8M11 3l-8 8" />
    </svg>
  );
}
