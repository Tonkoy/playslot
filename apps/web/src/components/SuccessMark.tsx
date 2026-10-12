/**
 * Big confirmation tick. The ring pops and the check draws itself once, so the
 * page reads as "done" before a word is read. Server- and client-safe; both
 * animations stop under reduced motion (the mark itself still shows).
 */
export function SuccessMark({ size = 104 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 52 52"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      style={{ display: 'block', margin: '0 auto' }}
    >
      <circle cx="26" cy="26" r="25" fill="var(--green-soft)" />
      <circle
        className="success-mark-ring"
        cx="26"
        cy="26"
        r="25"
        fill="none"
        stroke="var(--green)"
        strokeWidth="2"
      />
      <path
        className="success-mark-check"
        d="M15 27.5 L22.5 35 L37.5 19"
        fill="none"
        stroke="var(--green-deep)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
