'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { CLIENT_BASE } from '@/lib/api';
import { DatePicker } from '../DatePicker';
import { useToast } from '../Toast';

const PAST_MIN = '2000-01-01'; // exports may cover historical dates

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Club-admin CSV export of reservations for a date range (opens in Excel). */
export function ClubExport({ clubId }: { clubId: number }) {
  const t = useTranslations('Export');
  const tt = useTranslations('Toasts');
  const locale = useLocale();
  const toast = useToast();

  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const [from, setFrom] = useState(iso(monthAgo));
  const [to, setTo] = useState(iso(new Date()));
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${CLIENT_BASE}/api/clubs/${clubId}/export?from=${from}&to=${to}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`(${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `playslot-club-${clubId}-${from}_${to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast(e instanceof Error ? e.message : tt('error'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={card}>
      <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t('title')}</h2>
      <p style={{ color: 'var(--ink-2)', fontSize: 14, margin: '4px 0 14px' }}>{t('help')}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={field}>
          {t('from')}
          <DatePicker value={from} onChange={(v) => { setFrom(v); if (to < v) setTo(v); }} locale={locale} min={PAST_MIN} />
        </label>
        <label style={field}>
          {t('to')}
          <DatePicker value={to} onChange={setTo} locale={locale} min={from} />
        </label>
        <button
          type="button"
          onClick={download}
          disabled={busy}
          style={{ minHeight: 46, padding: '0 20px', background: 'var(--ink)', color: 'var(--lime)', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 700, cursor: 'pointer' }}
        >
          {busy ? '…' : `↓ ${t('download')}`}
        </button>
      </div>
    </section>
  );
}

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 20, boxShadow: 'var(--shadow-sm)' };
const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-2)', minWidth: 150 };
