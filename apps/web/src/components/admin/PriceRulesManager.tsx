'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { PriceRuleDto, UpsertPriceRuleInput } from '@playslot/contracts';
import {
  adminCreatePriceRule,
  adminDeletePriceRule,
  adminListCourts,
  adminListPriceRules,
  adminPreviewPrice,
  adminUpdatePriceRule,
} from '@/lib/api';
import { useToast } from '../Toast';

const EVERY_DAY = null;
const MON_FRI = 0b0111110; // bits 1–5
const SAT_SUN = 0b1000001; // bits 0 and 6

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const toMin = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

type Draft = {
  id: number | null;
  resourceId: number | null;
  weekdayMask: number | null;
  allDay: boolean;
  startMin: number;
  endMin: number;
  seasonal: boolean;
  validFrom: string;
  validUntil: string;
  durationMin: number;
  price: string; // major units, as typed
  priority: number;
  active: boolean;
};

const blank = (): Draft => ({
  id: null,
  resourceId: null,
  weekdayMask: EVERY_DAY,
  allDay: true,
  startMin: 7 * 60,
  endMin: 17 * 60,
  seasonal: false,
  validFrom: '',
  validUntil: '',
  durationMin: 60,
  price: '',
  priority: 0,
  active: true,
});

const fromRule = (r: PriceRuleDto): Draft => ({
  id: r.id,
  resourceId: r.resourceId,
  weekdayMask: r.weekdayMask,
  allDay: r.startMin === null,
  startMin: r.startMin ?? 7 * 60,
  endMin: r.endMin ?? 17 * 60,
  seasonal: Boolean(r.validFrom || r.validUntil),
  validFrom: r.validFrom ?? '',
  validUntil: r.validUntil ?? '',
  durationMin: r.durationMin ?? 60,
  price: (r.priceCents / 100).toFixed(2),
  priority: r.priority,
  active: r.active,
});

/**
 * Club price rules (spec §7). The engine already supports time bands, weekday
 * groups, per-court overrides and seasons — this is the surface that lets a
 * club author them, with a preview so a rule can be checked before a player
 * meets it.
 */
export function PriceRulesManager({ clubId }: { clubId: number }) {
  const t = useTranslations('Pricing');
  const tt = useTranslations('Toasts');
  const locale = useLocale();
  const qc = useQueryClient();
  const toast = useToast();

  const rules = useQuery({ queryKey: ['priceRules', clubId], queryFn: () => adminListPriceRules(clubId) });
  const courts = useQuery({ queryKey: ['courts', clubId], queryFn: () => adminListCourts(clubId) });

  const [draft, setDraft] = useState<Draft | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const [probe, setProbe] = useState({
    date: '',
    startMin: 18 * 60,
    durationMin: 60,
    resourceId: '' as number | '',
  });
  const preview = useQuery({
    queryKey: ['pricePreview', clubId, probe],
    queryFn: () =>
      adminPreviewPrice(clubId, {
        date: probe.date,
        startMin: probe.startMin,
        durationMin: probe.durationMin,
        ...(probe.resourceId === '' ? {} : { resourceId: probe.resourceId }),
      }),
    enabled: probe.date !== '',
  });

  const money = (cents: number, currency: string) =>
    new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-US', { style: 'currency', currency }).format(cents / 100);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['priceRules', clubId] });
    qc.invalidateQueries({ queryKey: ['pricePreview', clubId] });
    qc.invalidateQueries({ queryKey: ['availability', clubId] });
  };

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const cents = Math.round(Number(d.price.replace(',', '.')) * 100);
      if (!Number.isFinite(cents) || cents < 0) throw new Error(t('priceInvalid'));
      const input: UpsertPriceRuleInput = {
        resourceId: d.resourceId,
        serviceId: null,
        weekdayMask: d.weekdayMask,
        startMin: d.allDay ? null : d.startMin,
        endMin: d.allDay ? null : d.endMin,
        validFrom: d.seasonal && d.validFrom ? d.validFrom : null,
        validUntil: d.seasonal && d.validUntil ? d.validUntil : null,
        durationMin: d.durationMin,
        priceCents: cents,
        priority: d.priority,
        active: d.active,
      };
      return d.id === null
        ? adminCreatePriceRule(clubId, input)
        : adminUpdatePriceRule(clubId, d.id, input);
    },
    onSuccess: () => {
      setDraft(null);
      invalidate();
      toast(tt('priceSaved'));
    },
    onError: (e) => toast(e instanceof Error ? e.message : tt('error'), 'error'),
  });

  const del = useMutation({
    mutationFn: (id: number) => adminDeletePriceRule(clubId, id),
    onSuccess: () => {
      invalidate();
      toast(tt('priceDeleted'));
    },
    onError: (e) => toast(e instanceof Error ? e.message : tt('error'), 'error'),
  });

  /** One line of plain language describing when a rule applies. */
  const describe = (r: PriceRuleDto) => {
    const days =
      r.weekdayMask === null
        ? t('everyDay')
        : r.weekdayMask === MON_FRI
          ? t('monFri')
          : r.weekdayMask === SAT_SUN
            ? t('satSun')
            : t('customDays');
    const when = r.startMin === null ? t('allDay') : `${hhmm(r.startMin)}–${hhmm(r.endMin ?? 0)}`;
    const where = r.resourceName ?? t('allCourts');
    const season = r.validFrom || r.validUntil ? ` · ${r.validFrom ?? '…'} → ${r.validUntil ?? '…'}` : '';
    return `${days} · ${when} · ${where} · ${r.durationMin ?? 60} ${t('min')}${season}`;
  };

  return (
    <section style={card}>
      <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t('title')}</h2>
      <p style={{ color: 'var(--ink-2)', fontSize: 14, margin: '4px 0 14px' }}>{t('help')}</p>

      {/* ── existing rules ── */}
      {rules.isLoading && <p style={{ color: 'var(--ink-3)' }}>…</p>}
      {rules.isSuccess && rules.data.length === 0 && (
        <p style={{ color: 'var(--ink-2)', fontSize: 14 }}>{t('empty')}</p>
      )}
      {rules.isSuccess && rules.data.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {rules.data.map((r) => (
            <div key={r.id} style={{ ...ruleRow, opacity: r.active ? 1 : 0.55 }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{money(r.priceCents, r.currency)}</div>
                <div className="mono" style={{ color: 'var(--ink-3)', fontSize: 12, marginTop: 2 }}>
                  {describe(r)}
                </div>
              </div>
              {r.priority > 0 && <span style={badge}>{t('priorityShort', { n: r.priority })}</span>}
              {!r.active && <span style={badge}>{t('inactive')}</span>}
              <button type="button" onClick={() => setDraft(fromRule(r))} style={smallBtn}>
                {t('edit')}
              </button>
              <button
                type="button"
                onClick={() => del.mutate(r.id)}
                disabled={del.isPending}
                style={{ ...smallBtn, borderColor: 'var(--clay)', color: 'var(--clay)' }}
              >
                {t('delete')}
              </button>
            </div>
          ))}
        </div>
      )}

      {!draft && (
        <button type="button" onClick={() => setDraft(blank())} style={{ ...primaryBtn, marginTop: 14 }}>
          {t('addRule')}
        </button>
      )}

      {/* ── editor ── */}
      {draft && (
        <div style={editor}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
            {draft.id === null ? t('newRule') : t('editRule')}
          </h3>

          <div style={grid}>
            <label style={field}>
              {t('courts')}
              <select
                value={draft.resourceId ?? ''}
                onChange={(e) => set('resourceId', e.target.value === '' ? null : Number(e.target.value))}
                style={input}
              >
                <option value="">{t('allCourts')}</option>
                {courts.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={field}>
              {t('duration')}
              <select
                value={draft.durationMin}
                onChange={(e) => set('durationMin', Number(e.target.value))}
                style={input}
              >
                {[30, 60, 90, 120].map((d) => (
                  <option key={d} value={d}>
                    {d} {t('min')}
                  </option>
                ))}
              </select>
            </label>

            <label style={field}>
              {t('price')}
              <input
                inputMode="decimal"
                value={draft.price}
                onChange={(e) => set('price', e.target.value)}
                placeholder="16.00"
                style={input}
              />
            </label>

            <label style={field}>
              {t('priority')}
              <input
                type="number"
                min={0}
                max={1000}
                value={draft.priority}
                onChange={(e) => set('priority', Number(e.target.value))}
                style={input}
              />
            </label>
          </div>

          <div style={{ marginTop: 12 }}>
            <span style={label}>{t('days')}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              {(
                [
                  [t('everyDay'), EVERY_DAY],
                  [t('monFri'), MON_FRI],
                  [t('satSun'), SAT_SUN],
                ] as const
              ).map(([lbl, mask]) => (
                <button
                  key={lbl}
                  type="button"
                  onClick={() => set('weekdayMask', mask)}
                  aria-pressed={draft.weekdayMask === mask}
                  style={chip(draft.weekdayMask === mask)}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ ...toggle, marginBottom: draft.allDay ? 0 : 8 }}>
              <input type="checkbox" checked={draft.allDay} onChange={(e) => set('allDay', e.target.checked)} />
              {t('allDay')}
            </label>
            {!draft.allDay && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="time"
                  value={hhmm(draft.startMin)}
                  onChange={(e) => set('startMin', toMin(e.target.value))}
                  style={input}
                />
                <span style={{ color: 'var(--ink-3)' }}>→</span>
                <input
                  type="time"
                  value={hhmm(draft.endMin)}
                  onChange={(e) => set('endMin', toMin(e.target.value))}
                  style={input}
                />
              </div>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ ...toggle, marginBottom: draft.seasonal ? 8 : 0 }}>
              <input type="checkbox" checked={draft.seasonal} onChange={(e) => set('seasonal', e.target.checked)} />
              {t('seasonal')}
            </label>
            {draft.seasonal && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="date"
                  value={draft.validFrom}
                  onChange={(e) => set('validFrom', e.target.value)}
                  style={input}
                />
                <span style={{ color: 'var(--ink-3)' }}>→</span>
                <input
                  type="date"
                  value={draft.validUntil}
                  onChange={(e) => set('validUntil', e.target.value)}
                  style={input}
                />
              </div>
            )}
          </div>

          <label style={{ ...toggle, marginTop: 12 }}>
            <input type="checkbox" checked={draft.active} onChange={(e) => set('active', e.target.checked)} />
            {t('activeRule')}
          </label>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => save.mutate(draft)} disabled={save.isPending} style={primaryBtn}>
              {save.isPending ? '…' : t('save')}
            </button>
            <button type="button" onClick={() => setDraft(null)} style={smallBtn}>
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* ── preview ── */}
      <div style={{ ...editor, marginTop: 18 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700 }}>{t('previewTitle')}</h3>
        <p style={{ color: 'var(--ink-3)', fontSize: 12, margin: '4px 0 10px' }}>{t('previewHelp')}</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="date"
            value={probe.date}
            onChange={(e) => setProbe({ ...probe, date: e.target.value })}
            style={input}
          />
          <input
            type="time"
            value={hhmm(probe.startMin)}
            onChange={(e) => setProbe({ ...probe, startMin: toMin(e.target.value) })}
            style={input}
          />
          <select
            value={probe.durationMin}
            onChange={(e) => setProbe({ ...probe, durationMin: Number(e.target.value) })}
            style={input}
          >
            {[30, 60, 90, 120].map((d) => (
              <option key={d} value={d}>
                {d} {t('min')}
              </option>
            ))}
          </select>
          <select
            value={probe.resourceId}
            onChange={(e) =>
              setProbe({ ...probe, resourceId: e.target.value === '' ? '' : Number(e.target.value) })
            }
            style={input}
          >
            <option value="">{t('anyCourt')}</option>
            {courts.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {probe.date !== '' && preview.isSuccess && (
          <p style={{ marginTop: 10, fontSize: 15 }}>
            {preview.data.error === 'no_rule' ? (
              <span style={{ color: 'var(--clay)', fontWeight: 600 }}>{t('noRule')}</span>
            ) : (
              <>
                <strong style={{ fontSize: 18 }}>
                  {money(preview.data.priceCents ?? 0, preview.data.currency)}
                </strong>
                <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 12, marginLeft: 8 }}>
                  {t('viaRule', { id: preview.data.ruleId ?? 0 })}
                </span>
              </>
            )}
          </p>
        )}
      </div>
    </section>
  );
}

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  padding: 20,
};
const ruleRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  padding: '10px 12px',
  background: 'var(--surface-2)',
};
const editor: React.CSSProperties = {
  marginTop: 16,
  border: '1px solid var(--line-2)',
  borderRadius: 'var(--radius-sm)',
  padding: 16,
};
const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 12,
};
const field: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
};
const label: React.CSSProperties = { fontSize: 13, fontWeight: 600 };
const input: React.CSSProperties = {
  minHeight: 42,
  padding: '0 10px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 400,
};
const toggle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  fontWeight: 600,
};
const chip = (on: boolean): React.CSSProperties => ({
  minHeight: 38,
  padding: '0 14px',
  borderRadius: 'var(--pill)',
  border: `2px solid ${on ? 'var(--green-deep)' : 'var(--line-2)'}`,
  background: on ? 'var(--lime)' : 'var(--surface)',
  color: on ? 'var(--on-lime)' : 'var(--ink)',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
});
const primaryBtn: React.CSSProperties = {
  minHeight: 42,
  padding: '0 18px',
  background: 'var(--lime)',
  color: 'var(--on-lime)',
  border: 'none',
  borderRadius: 'var(--pill)',
  fontWeight: 700,
  cursor: 'pointer',
};
const smallBtn: React.CSSProperties = {
  minHeight: 36,
  padding: '0 12px',
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 'var(--pill)',
  fontSize: 13,
  cursor: 'pointer',
};
const badge: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: '3px 8px',
  borderRadius: 'var(--pill)',
  background: 'var(--green-soft)',
  color: 'var(--green-deep)',
  whiteSpace: 'nowrap',
};
