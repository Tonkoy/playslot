'use client';

import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { AddMemberInput, InviteResultDto } from '@playslot/contracts';

/**
 * Add a person to a club by email — links an existing user or invites a new one.
 * On a new invite, shows the set-password link so the admin can share it while
 * email delivery is unavailable (dev).
 */
export function AddMemberForm({
  onSubmit,
  submitLabel,
  withName = true,
  onDone,
}: {
  onSubmit: (input: AddMemberInput) => Promise<InviteResultDto>;
  submitLabel: string;
  withName?: boolean;
  onDone?: () => void;
}) {
  const t = useTranslations('Team');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [copied, setCopied] = useState(false);

  const mut = useMutation({
    mutationFn: () => onSubmit({ email, name: name || undefined }),
    onSuccess: () => {
      setEmail('');
      setName('');
      onDone?.();
    },
  });

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mut.mutate();
        }}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}
      >
        <label style={fieldLabel}>
          {t('email')}
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...fieldInput, minWidth: 200 }} />
        </label>
        {withName && (
          <label style={fieldLabel}>
            {t('name')}
            <input value={name} onChange={(e) => setName(e.target.value)} style={fieldInput} />
          </label>
        )}
        <button type="submit" disabled={mut.isPending} style={primaryBtn}>
          {mut.isPending ? '…' : submitLabel}
        </button>
      </form>

      {mut.isError && <p style={{ color: 'var(--clay)', fontSize: 13, marginTop: 8 }}>{(mut.error as Error).message}</p>}

      {mut.isSuccess && (
        <div style={{ marginTop: 10, background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
          {mut.data.invited ? (
            <>
              <p style={{ fontSize: 13, color: 'var(--ink-2)' }}>{t('invited', { email: mut.data.email })}</p>
              {mut.data.inviteLink && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <code style={{ fontSize: 12, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6, padding: '6px 8px', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {mut.data.inviteLink}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(mut.data!.inviteLink!).then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      });
                    }}
                    style={smallBtn}
                  >
                    {copied ? t('copied') : t('copyLink')}
                  </button>
                </div>
              )}
            </>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--teal)' }}>{t('linked', { email: mut.data.email })}</p>
          )}
        </div>
      )}
    </div>
  );
}

const fieldLabel: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-2)' };
const fieldInput: React.CSSProperties = {
  minHeight: 44,
  padding: '0 10px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'inherit',
};
const primaryBtn: React.CSSProperties = {
  minHeight: 44,
  padding: '0 18px',
  background: 'var(--lime)',
  color: 'var(--on-lime)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  fontWeight: 700,
  cursor: 'pointer',
};
const smallBtn: React.CSSProperties = {
  minHeight: 36,
  padding: '0 12px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  fontSize: 13,
};
