'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  REINSTATEMENT_FEE_CENTS,
  SUSPENSION_REASONS,
  type PlatformUserDto,
  type SuspensionReasonCode,
} from '@playslot/contracts';
import { platformDeleteUser, platformListUsers, platformReinstateUser, platformSuspendUser, platformVerifyUserEmail } from '@/lib/api';
import { Modal } from '../Modal';
import { useToast } from '../Toast';

type Dialog =
  | { kind: 'suspend'; user: PlatformUserDto }
  | { kind: 'reinstate'; user: PlatformUserDto }
  | { kind: 'delete'; user: PlatformUserDto }
  | null;

/**
 * Platform-admin user moderation: find a player, restrict them for no-shows or
 * non-payment (lifted once the 10 € reinstatement fee is settled), or delete an
 * account that was registered by mistake.
 */
export function UsersModeration() {
  const t = useTranslations('Moderation');
  const tt = useTranslations('Toasts');
  const locale = useLocale();
  const qc = useQueryClient();
  const toast = useToast();

  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [onlySuspended, setOnlySuspended] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setQ(input), 300);
    return () => clearTimeout(id);
  }, [input]);

  const users = useQuery({
    queryKey: ['platformUsers', q, onlySuspended],
    queryFn: () => platformListUsers(q, onlySuspended),
  });

  const [dialog, setDialog] = useState<Dialog>(null);
  const [reason, setReason] = useState<SuspensionReasonCode>('NO_SHOW');
  const [note, setNote] = useState('');
  const [chargeFee, setChargeFee] = useState(true);
  const [cancelUpcoming, setCancelUpcoming] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const openDialog = (d: NonNullable<Dialog>) => {
    setDialog(d);
    setReason(d.user.unpaidCount > 0 && d.user.noShowCount === 0 ? 'NON_PAYMENT' : 'NO_SHOW');
    setNote('');
    setChargeFee(true);
    setCancelUpcoming(false);
    setConfirmText('');
  };
  const done = (msg: string) => {
    setDialog(null);
    qc.invalidateQueries({ queryKey: ['platformUsers'] });
    toast(msg);
  };
  const fail = (e: unknown) => toast(e instanceof Error ? e.message : tt('error'), 'error');

  const suspend = useMutation({
    mutationFn: (u: PlatformUserDto) =>
      platformSuspendUser(u.id, {
        reason,
        note: note.trim() || undefined,
        cancelUpcoming,
        feeCents: chargeFee ? REINSTATEMENT_FEE_CENTS : 0,
      }),
    onSuccess: (r) => done(r.cancelled > 0 ? t('suspendedWithCancel', { n: r.cancelled }) : t('suspendedToast')),
    onError: fail,
  });
  const reinstate = useMutation({
    mutationFn: (a: { u: PlatformUserDto; feePaid: boolean }) => platformReinstateUser(a.u.id, a.feePaid),
    onSuccess: () => done(t('reinstatedToast')),
    onError: fail,
  });
  const verify = useMutation({
    mutationFn: (u: PlatformUserDto) => platformVerifyUserEmail(u.id),
    onSuccess: () => done(t('verifiedToast')),
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (u: PlatformUserDto) => platformDeleteUser(u.id, note.trim() || undefined),
    onSuccess: (r) => done(r.mode === 'deleted' ? t('deletedToast') : t('anonymizedToast')),
    onError: fail,
  });

  const money = (cents: number) =>
    new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-US', { style: 'currency', currency: 'EUR' }).format(cents / 100);
  const dtf = new Intl.DateTimeFormat(locale === 'bg' ? 'bg-BG' : 'en-US', { dateStyle: 'medium' });
  const fee = money(REINSTATEMENT_FEE_CENTS);

  return (
    <section style={{ ...card, borderColor: 'var(--clay)' }}>
      <h2 style={{ fontSize: 20, fontWeight: 800 }}>{t('title')}</h2>
      <p style={{ color: 'var(--ink-2)', fontSize: 14, margin: '4px 0 14px' }}>{t('subtitle', { fee })}</p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          style={{ ...field, flex: 1, minWidth: 220 }}
        />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14, color: 'var(--ink-2)' }}>
          <input type="checkbox" checked={onlySuspended} onChange={(e) => setOnlySuspended(e.target.checked)} />
          {t('onlySuspended')}
        </label>
      </div>

      {users.isLoading && <p style={{ color: 'var(--ink-3)' }}>…</p>}
      {users.isSuccess && users.data.length === 0 && <p style={{ color: 'var(--ink-3)' }}>{t('empty')}</p>}

      <div style={{ display: 'grid', gap: 8 }}>
        {users.data?.map((u) => {
          const isPlatform = u.roles.includes('PLATFORM_ADMIN');
          return (
            <div key={u.id} style={{ ...rowCard, borderColor: u.suspendedAt ? 'var(--clay)' : 'var(--line)' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700 }}>
                  {u.name}{' '}
                  {u.suspendedAt && (
                    <span className="mono" style={{ ...badge, color: 'var(--clay)', borderColor: 'var(--clay)' }}>
                      {t('suspendedBadge')}
                    </span>
                  )}
                  {!u.emailVerified && <span className="mono" style={badge}>{t('unverified')}</span>}
                </div>
                <div className="mono" style={{ color: 'var(--ink-3)', fontSize: 12, wordBreak: 'break-all' }}>
                  {u.email}
                  {u.phone ? ` · ${u.phone}` : ''} · {u.roles.join(', ') || '—'} · {t('since', { date: dtf.format(new Date(u.createdAt)) })}
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span>{t('bookings', { n: u.bookingCount })}</span>
                  <span style={{ color: u.noShowCount > 0 ? 'var(--clay)' : undefined }}>{t('noShows', { n: u.noShowCount })}</span>
                  <span style={{ color: u.unpaidCount > 0 ? 'var(--clay)' : undefined }}>{t('unpaid', { n: u.unpaidCount })}</span>
                </div>
                {u.suspendedAt && (
                  <div style={{ fontSize: 13, color: 'var(--clay)', marginTop: 4 }}>
                    {t(`reasons.${u.suspensionReason ?? 'OTHER'}`)}
                    {u.suspensionNote ? ` — ${u.suspensionNote}` : ''} · {t('owed', { fee: money(u.reinstatementFeeCents ?? 0) })}
                  </div>
                )}
              </div>
              {!isPlatform && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {!u.emailVerified && (
                    <button type="button" style={primaryBtn} disabled={verify.isPending} onClick={() => verify.mutate(u)}>
                      {t('verifyEmail')}
                    </button>
                  )}
                  {u.suspendedAt ? (
                    <button type="button" style={primaryBtn} onClick={() => openDialog({ kind: 'reinstate', user: u })}>
                      {t('reinstate')}
                    </button>
                  ) : (
                    <button type="button" style={warnBtn} onClick={() => openDialog({ kind: 'suspend', user: u })}>
                      {t('suspend')}
                    </button>
                  )}
                  <button type="button" style={dangerBtn} onClick={() => openDialog({ kind: 'delete', user: u })}>
                    {t('delete')}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── suspend ── */}
      <Modal open={dialog?.kind === 'suspend'} onClose={() => setDialog(null)} title={t('suspendTitle')}>
        {dialog?.kind === 'suspend' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              suspend.mutate(dialog.user);
            }}
            style={{ display: 'grid', gap: 14 }}
          >
            <p style={{ color: 'var(--ink-2)', fontSize: 14 }}>{t('suspendBody', { name: dialog.user.name })}</p>
            <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              <legend style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 6 }}>{t('reasonLabel')}</legend>
              {SUSPENSION_REASONS.map((r) => (
                <label key={r} style={radioRow}>
                  <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
                  {t(`reasons.${r}`)}
                </label>
              ))}
            </fieldset>
            <label style={{ display: 'grid', gap: 6, fontSize: 13, color: 'var(--ink-2)' }}>
              {t('noteLabel')}
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} style={field} placeholder={t('notePlaceholder')} />
            </label>
            <label style={radioRow}>
              <input type="checkbox" checked={chargeFee} onChange={(e) => setChargeFee(e.target.checked)} />
              {t('chargeFee', { fee })}
            </label>
            <label style={radioRow}>
              <input type="checkbox" checked={cancelUpcoming} onChange={(e) => setCancelUpcoming(e.target.checked)} />
              {t('cancelUpcoming')}
            </label>
            <div style={actions}>
              <button type="button" style={secondaryBtn} onClick={() => setDialog(null)}>
                {t('cancel')}
              </button>
              <button type="submit" style={warnBtnSolid} disabled={suspend.isPending}>
                {suspend.isPending ? '…' : t('suspendConfirm')}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── reinstate ── */}
      <Modal open={dialog?.kind === 'reinstate'} onClose={() => setDialog(null)} title={t('reinstateTitle')}>
        {dialog?.kind === 'reinstate' && (
          <div style={{ display: 'grid', gap: 14 }}>
            <p style={{ color: 'var(--ink-2)', fontSize: 14 }}>
              {(dialog.user.reinstatementFeeCents ?? 0) > 0
                ? t('reinstateBodyFee', { name: dialog.user.name, fee: money(dialog.user.reinstatementFeeCents ?? 0) })
                : t('reinstateBodyNoFee', { name: dialog.user.name })}
            </p>
            <div style={actions}>
              {(dialog.user.reinstatementFeeCents ?? 0) > 0 && (
                <button
                  type="button"
                  style={secondaryBtn}
                  disabled={reinstate.isPending}
                  onClick={() => reinstate.mutate({ u: dialog.user, feePaid: false })}
                >
                  {t('waiveFee')}
                </button>
              )}
              <button
                type="button"
                style={primaryBtn}
                disabled={reinstate.isPending}
                onClick={() => reinstate.mutate({ u: dialog.user, feePaid: (dialog.user.reinstatementFeeCents ?? 0) > 0 })}
              >
                {(dialog.user.reinstatementFeeCents ?? 0) > 0 ? t('feePaid') : t('reinstate')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── delete ── */}
      <Modal open={dialog?.kind === 'delete'} onClose={() => setDialog(null)} title={t('deleteTitle')}>
        {dialog?.kind === 'delete' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              remove.mutate(dialog.user);
            }}
            style={{ display: 'grid', gap: 14 }}
          >
            <p style={{ color: 'var(--ink-2)', fontSize: 14 }}>{t('deleteBody', { name: dialog.user.name })}</p>
            <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>{t('deleteHistoryNote')}</p>
            <label style={{ display: 'grid', gap: 6, fontSize: 13, color: 'var(--ink-2)' }}>
              {t('deleteReasonLabel')}
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} style={field} placeholder={t('deleteReasonPlaceholder')} />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 13, color: 'var(--ink-2)' }}>
              {t('typeEmailToConfirm')}
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} style={field} autoComplete="off" />
            </label>
            <div style={actions}>
              <button type="button" style={secondaryBtn} onClick={() => setDialog(null)}>
                {t('cancel')}
              </button>
              <button
                type="submit"
                style={dangerBtnSolid}
                disabled={remove.isPending || confirmText.trim().toLowerCase() !== dialog.user.email.toLowerCase()}
              >
                {remove.isPending ? '…' : t('deleteConfirm')}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  padding: 20,
  marginBottom: 28,
};
const rowCard: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  alignItems: 'center',
  flexWrap: 'wrap',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  padding: '12px 14px',
  background: 'var(--surface-2)',
};
const badge: React.CSSProperties = {
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 100,
  border: '1px solid var(--line-2)',
  color: 'var(--ink-3)',
  marginLeft: 6,
  fontWeight: 500,
};
const field: React.CSSProperties = {
  minHeight: 44,
  padding: '0 12px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'inherit',
};
const radioRow: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, color: 'var(--ink)' };
const actions: React.CSSProperties = { display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' };
const pill: React.CSSProperties = { minHeight: 40, padding: '0 16px', borderRadius: 'var(--pill)', cursor: 'pointer', fontWeight: 600, fontSize: 14 };
const primaryBtn: React.CSSProperties = { ...pill, background: 'var(--lime)', color: 'var(--on-lime)', border: 'none', fontWeight: 700 };
const secondaryBtn: React.CSSProperties = { ...pill, background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line-2)' };
const warnBtn: React.CSSProperties = { ...pill, background: 'var(--surface)', color: 'var(--clay)', border: '1px solid var(--clay)' };
const warnBtnSolid: React.CSSProperties = { ...pill, background: 'var(--clay)', color: '#fff', border: 'none', fontWeight: 700 };
const dangerBtn: React.CSSProperties = { ...pill, background: 'var(--surface)', color: 'var(--ink-3)', border: '1px solid var(--line-2)' };
const dangerBtnSolid: React.CSSProperties = { ...pill, background: '#b3261e', color: '#fff', border: 'none', fontWeight: 700 };
