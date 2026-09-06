// Shared styles for the auth forms (register / login / reset / forgot).
export const authLabel: React.CSSProperties = {
  display: 'grid',
  gap: 6,
  fontSize: 14,
  color: 'var(--ink-2)',
};

export const authInput: React.CSSProperties = {
  minHeight: 44,
  padding: '0 12px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'inherit',
  fontSize: 15,
};

export const authPrimaryBtn: React.CSSProperties = {
  minHeight: 46,
  padding: '0 16px',
  background: 'var(--lime)',
  color: 'var(--on-lime)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 15,
};

export const googleBtn: React.CSSProperties = {
  display: 'block',
  textAlign: 'center',
  minHeight: 46,
  lineHeight: '46px',
  background: 'var(--surface)',
  color: 'var(--ink)',
  border: '1px solid var(--line-2)',
  borderRadius: 'var(--radius-sm)',
  fontWeight: 600,
  textDecoration: 'none',
};
