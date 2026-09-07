'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { MembershipPlanDto, UpsertMembershipPlanInput } from '@playslot/contracts';
import {
  adminCreateMembershipPlan,
  adminGrantMembership,
  adminUpdateMembershipPlan,
  getClubMembershipPlans,
} from '@/lib/api';
import { useToast } from '../Toast';

type PlanDraft = { name: string; priceCents: number; durationDays: number; discountPercent: number };
const EMPTY_PLAN: PlanDraft = { name: '', priceCents: 0, durationDays: 30, discountPercent: 10 };

/** Club-admin management of membership plans + granting memberships (spec §9). */
export function MembershipManager({ clubId, currency }: { clubId: number; currency: string }) {
  const t = useTranslations('Admin');
  const tt = useTranslations('Toasts');
  const qc = useQueryClient();
  const toast = useToast();

  const plans = useQuery({
    queryKey: ['membershipPlans', clubId],
    queryFn: () => getClubMembershipPlans(clubId),
  });

  const createMut = useMutation({
    mutationFn: (input: UpsertMembershipPlanInput) => adminCreateMembershipPlan(clubId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['membershipPlans', clubId] }),
  });
  const updateMut = useMutation({
    mutationFn: (args: { id: number; input: UpsertMembershipPlanInput }) =>
      adminUpdateMembershipPlan(clubId, args.id, args.input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['membershipPlans', clubId] }),
  });
  const grantMut = useMutation({
    mutationFn: (input: { userEmail: string; planId: number }) => adminGrantMembership(clubId, input),
    onSuccess: () => toast(tt('membershipGranted')),
    onError: (e) => toast(e instanceof Error ? e.message : tt('error'), 'error'),
  });

  const [draft, setDraft] = useState<PlanDraft>(EMPTY_PLAN);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<PlanDraft>(EMPTY_PLAN);
  const [grantEmail, setGrantEmail] = useState('');
  const [grantPlanId, setGrantPlanId] = useState<number | ''>('');

  return (
    <section style={card}>
      <h2 style={h2}>{t('membershipsTitle')}</h2>
      <p style={{ color: 'var(--ink-2)', fontSize: 14, margin: '4px 0 14px' }}>{t('membershipsHelp')}</p>

      {plans.isLoading && <p style={{ color: 'var(--ink-3)' }}>…</p>}
      {plans.isSuccess && (
        <div style={{ display: 'grid', gap: 10 }}>
          {plans.data.length === 0 && (
            <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{t('noPlans')}</p>
          )}
          {plans.data.map((p) =>
            editingId === p.id ? (
              <PlanFields
                key={p.id}
                value={editDraft}
                onChange={setEditDraft}
                onSubmit={() =>
                  updateMut.mutate({ id: p.id, input: editDraft }, { onSuccess: () => setEditingId(null) })
                }
                onCancel={() => setEditingId(null)}
                submitLabel={t('save')}
                busy={updateMut.isPending}
                currency={currency}
                t={t}
              />
            ) : (
              <PlanRow
                key={p.id}
                plan={p}
                currency={currency}
                onEdit={() => {
                  setEditingId(p.id);
                  setEditDraft({
                    name: p.name,
                    priceCents: p.priceCents,
                    durationDays: p.durationDays,
                    discountPercent: p.discountPercent,
                  });
                }}
                t={t}
              />
            ),
          )}
        </div>
      )}

      <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
        <h3 style={h3}>{t('addPlan')}</h3>
        <PlanFields
          value={draft}
          onChange={setDraft}
          onSubmit={() => createMut.mutate(draft, { onSuccess: () => setDraft(EMPTY_PLAN) })}
          submitLabel={t('add')}
          busy={createMut.isPending}
          currency={currency}
          t={t}
        />
        {createMut.isError && (
          <p style={err}>{(createMut.error as Error).message}</p>
        )}
      </div>

      {/* ── grant a membership to a customer ── */}
      <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
        <h3 style={h3}>{t('grantTitle')}</h3>
        <p style={{ color: 'var(--ink-2)', fontSize: 13, margin: '2px 0 10px' }}>{t('grantHelp')}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!grantPlanId) return;
            grantMut.mutate(
              { userEmail: grantEmail, planId: Number(grantPlanId) },
              { onSuccess: () => setGrantEmail('') },
            );
          }}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}
        >
          <label style={fieldLabel}>
            {t('customerEmail')}
            <input
              required
              type="email"
              value={grantEmail}
              onChange={(e) => setGrantEmail(e.target.value)}
              style={{ ...fieldInput, minWidth: 220 }}
            />
          </label>
          <label style={fieldLabel}>
            {t('plan')}
            <select
              required
              value={grantPlanId}
              onChange={(e) => setGrantPlanId(e.target.value ? Number(e.target.value) : '')}
              style={fieldInput}
            >
              <option value="">—</option>
              {(plans.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={grantMut.isPending} style={primaryBtn}>
            {grantMut.isPending ? '…' : t('grant')}
          </button>
        </form>
        {grantMut.isSuccess && <p style={ok}>{t('granted')}</p>}
        {grantMut.isError && <p style={err}>{(grantMut.error as Error).message}</p>}
      </div>
    </section>
  );
}

function PlanRow({
  plan,
  currency,
  onEdit,
  t,
}: {
  plan: MembershipPlanDto;
  currency: string;
  onEdit: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div style={row}>
      <span style={{ fontWeight: 700, minWidth: 120 }}>{plan.name}</span>
      <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
        {(plan.priceCents / 100).toFixed(2)} {currency} · {plan.durationDays} {t('days')} ·{' '}
        <strong style={{ color: 'var(--teal)' }}>−{plan.discountPercent}%</strong>
      </span>
      <span style={{ marginLeft: 'auto' }}>
        <button type="button" onClick={onEdit} style={smallBtn}>
          {t('edit')}
        </button>
      </span>
    </div>
  );
}

function PlanFields({
  value,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  busy,
  currency,
  t,
}: {
  value: PlanDraft;
  onChange: (v: PlanDraft) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  submitLabel: string;
  busy: boolean;
  currency: string;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}
    >
      <label style={fieldLabel}>
        {t('planName')}
        <input
          required
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          style={fieldInput}
        />
      </label>
      <label style={fieldLabel}>
        {t('priceLabel', { currency })}
        <input
          type="number"
          min={0}
          step="0.01"
          value={value.priceCents / 100}
          onChange={(e) => onChange({ ...value, priceCents: Math.round(Number(e.target.value) * 100) })}
          style={{ ...fieldInput, width: 110 }}
        />
      </label>
      <label style={fieldLabel}>
        {t('durationDays')}
        <input
          type="number"
          min={1}
          value={value.durationDays}
          onChange={(e) => onChange({ ...value, durationDays: Number(e.target.value) })}
          style={{ ...fieldInput, width: 90 }}
        />
      </label>
      <label style={fieldLabel}>
        {t('discountPercent')}
        <input
          type="number"
          min={0}
          max={100}
          value={value.discountPercent}
          onChange={(e) => onChange({ ...value, discountPercent: Number(e.target.value) })}
          style={{ ...fieldInput, width: 80 }}
        />
      </label>
      <button type="submit" disabled={busy} style={primaryBtn}>
        {busy ? '…' : submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} style={smallBtn}>
          {t('cancel')}
        </button>
      )}
    </form>
  );
}

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  padding: 20,
  boxShadow: 'var(--shadow-sm)',
};
const h2: React.CSSProperties = { fontSize: 18, fontWeight: 700 };
const h3: React.CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 10 };
const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  padding: '10px 12px',
};
const fieldLabel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 12,
  color: 'var(--ink-2)',
};
const fieldInput: React.CSSProperties = {
  minHeight: 44,
  padding: '0 10px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'inherit',
};
const smallBtn: React.CSSProperties = {
  minHeight: 40,
  padding: '0 14px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  fontSize: 14,
};
const primaryBtn: React.CSSProperties = {
  ...smallBtn,
  background: 'var(--lime)',
  color: 'var(--on-lime)',
  border: 'none',
  fontWeight: 700,
};
const err: React.CSSProperties = { color: 'var(--clay)', fontSize: 13, marginTop: 8 };
const ok: React.CSSProperties = { color: 'var(--teal)', fontSize: 13, marginTop: 8 };
