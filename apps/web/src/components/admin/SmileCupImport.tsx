'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Select } from '@/components/Picker';
import { BusyLabel } from '@/components/Spinner';
import { useToast } from '@/components/Toast';
import { Link } from '@/i18n/navigation';
import {
  blockSmileCupTournament,
  listSmileCupTournaments,
  previewSmileCupBlock,
  releaseSmileCupTournament,
  type SmileCupList,
  type SmileCupPreview,
  type SmileCupTournamentRow,
  type SmileCupWindow,
} from '@/lib/api';
import { errorMessage } from '@/lib/errors';

/** Most tournaments run from mid-morning into the afternoon; the admin adjusts. */
const DEFAULT_START = 9 * 60;
const DEFAULT_END = 15 * 60;

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/**
 * Smile Cup tournaments → blocked courts. The admin asks for the list (nothing
 * is fetched or blocked on its own), picks the hours and courts per tournament
 * — the feed has no start time — previews what is already booked in that
 * window, then blocks. Existing bookings are never touched: only the free time
 * around them is blocked, and they are listed so the club can call the players.
 */
export function SmileCupImport({ clubId }: { clubId: number }) {
  const t = useTranslations('SmileCup');
  const [asked, setAsked] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const list = useQuery({
    queryKey: ['smilecup', clubId],
    queryFn: () => listSmileCupTournaments(clubId),
    enabled: asked,
    staleTime: 60_000,
    retry: false,
  });

  const rows = (list.data?.tournaments ?? []).filter((x) => showAll || x.atThisClub);
  const elsewhere = (list.data?.tournaments ?? []).filter((x) => !x.atThisClub).length;

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={h2}>{t('title')}</h2>
        <button
          type="button"
          onClick={() => (asked ? void list.refetch() : setAsked(true))}
          disabled={list.isFetching}
          style={{ ...primaryBtn, marginLeft: 'auto' }}
        >
          <BusyLabel busy={list.isFetching}>{asked ? t('refresh') : t('check')}</BusyLabel>
        </button>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 6 }}>{t('intro')}</p>

      {list.isError && (
        <p role="alert" style={{ color: 'var(--clay)', marginTop: 12 }}>
          {t('unavailable')}
        </p>
      )}

      {list.isSuccess && (
        <>
          {elsewhere > 0 && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 14, color: 'var(--ink-2)' }}>
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              {t('showElsewhere', { count: elsewhere })}
            </label>
          )}
          {rows.length === 0 ? (
            <p style={{ color: 'var(--ink-2)', marginTop: 12 }}>{t(list.data.tournaments.length ? 'noneHere' : 'none')}</p>
          ) : (
            <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
              {rows.map((row) => (
                <TournamentRow key={row.id} clubId={clubId} row={row} data={list.data} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function TournamentRow({ clubId, row, data }: { clubId: number; row: SmileCupTournamentRow; data: SmileCupList }) {
  const t = useTranslations('SmileCup');
  const te = useTranslations('Errors');
  const tt = useTranslations('Toasts');
  const tn = useTranslations('Tournaments');
  const locale = useLocale();
  const toast = useToast();
  const qc = useQueryClient();

  const allCourtIds = data.courts.map((c) => c.id);
  const [startMin, setStartMin] = useState(row.block?.startMin ?? DEFAULT_START);
  const [endMin, setEndMin] = useState(row.block?.endMin ?? DEFAULT_END);
  const [courtIds, setCourtIds] = useState<number[]>(row.block?.courtIds ?? allCourtIds);
  const [preview, setPreview] = useState<SmileCupPreview | null>(null);
  const [confirmRelease, setConfirmRelease] = useState(false);

  const window: SmileCupWindow = { startMin, endMin, courtIds };
  const valid = endMin > startMin && courtIds.length > 0;
  // Anything changed after a preview makes that preview stale.
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPreview(null);
  };

  const step = data.slotIntervalMin || 60;
  const times = useMemo(() => {
    const out = [];
    for (let m = 6 * 60; m <= 24 * 60; m += step) out.push({ value: String(m), label: hhmm(m) });
    return out;
  }, [step]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['smilecup', clubId] });

  const check = useMutation({
    mutationFn: () => previewSmileCupBlock(clubId, row.id, window),
    onSuccess: setPreview,
    onError: (e) => toast(errorMessage(e, te, tt('error')), 'error'),
  });
  const block = useMutation({
    mutationFn: () => blockSmileCupTournament(clubId, row.id, window),
    onSuccess: (res) => {
      setPreview(null);
      toast(t('blocked', { count: res.created }));
      if (res.failed.length) toast(t('someFailed', { count: res.failed.length }), 'error');
      void refresh();
    },
    onError: (e) => toast(errorMessage(e, te, tt('error')), 'error'),
  });
  const release = useMutation({
    mutationFn: () => releaseSmileCupTournament(clubId, row.id),
    onSuccess: () => {
      setConfirmRelease(false);
      setPreview(null);
      toast(t('released'));
      void refresh();
    },
    onError: (e) => toast(errorMessage(e, te, tt('error')), 'error'),
  });

  const day = new Intl.DateTimeFormat(locale === 'bg' ? 'bg-BG' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${row.day}T00:00:00Z`));
  const tags = [
    row.levelName,
    row.gender && tn.has(`gender.${row.gender}`) ? tn(`gender.${row.gender}`) : null,
    row.discipline && tn.has(`discipline.${row.discipline}`) ? tn(`discipline.${row.discipline}`) : null,
  ].filter(Boolean);
  const busy = check.isPending || block.isPending || release.isPending;

  return (
    <article style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: 16, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Grows to fill the row; on a phone the status drops below it. */}
        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
          <div className="mono" style={{ fontSize: 12.5, color: 'var(--green)' }}>
            {day.charAt(0).toUpperCase() + day.slice(1)}
          </div>
          <div style={{ fontWeight: 700, fontSize: 16, marginTop: 2 }}>{row.name}</div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 2 }}>
            {[row.venue, tags.join(' · ')].filter(Boolean).join(' — ')}
          </div>
        </div>
        <span
          style={{
            padding: '5px 11px',
            borderRadius: 'var(--pill)',
            fontSize: 12.5,
            fontWeight: 700,
            background: row.block ? 'var(--tournament-soft)' : 'var(--surface-2)',
            color: row.block ? 'var(--tournament)' : 'var(--ink-3)',
            whiteSpace: 'nowrap',
          }}
        >
          {row.block
            ? t('statusBlocked', { from: hhmm(row.block.startMin), to: hhmm(row.block.endMin), courts: row.block.courtIds.length })
            : t('statusFree')}
        </span>
      </div>

      {/* Hours and courts to block */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 14 }}>
        <label style={fieldLabel}>
          {t('from')}
          <Select ariaLabel={t('from')} options={times} value={String(startMin)} onChange={(v) => edit(setStartMin)(Number(v))} />
        </label>
        <label style={fieldLabel}>
          {t('to')}
          <Select ariaLabel={t('to')} options={times} value={String(endMin)} onChange={(v) => edit(setEndMin)(Number(v))} />
        </label>
      </div>
      {endMin <= startMin && <p style={{ color: 'var(--clay)', fontSize: 13, marginTop: 6 }}>{t('endBeforeStart')}</p>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
        <button
          type="button"
          onClick={() => edit(setCourtIds)(courtIds.length === allCourtIds.length ? [] : allCourtIds)}
          style={chipBtn(courtIds.length === allCourtIds.length)}
          aria-pressed={courtIds.length === allCourtIds.length}
        >
          {t('allCourts')}
        </button>
        {data.courts.map((c) => {
          const on = courtIds.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => edit(setCourtIds)(on ? courtIds.filter((x) => x !== c.id) : [...courtIds, c.id])}
              style={chipBtn(on)}
            >
              {c.name}
            </button>
          );
        })}
      </div>

      {/* Preview */}
      {preview && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', fontSize: 14 }}>
          <p style={{ fontWeight: 700 }}>
            {preview.freeMinutes > 0
              ? t('willBlock', { hours: Math.round((preview.freeMinutes / 60) * 10) / 10, pieces: preview.segments })
              : t('nothingFree')}
          </p>
          {preview.conflicts.length === 0 ? (
            <p style={{ color: 'var(--ink-2)', marginTop: 4 }}>{t('noConflicts')}</p>
          ) : (
            <>
              <p style={{ color: 'var(--ink-2)', marginTop: 6 }}>{t('conflictsIntro', { count: preview.conflicts.length })}</p>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
                {preview.conflicts.map((c) => (
                  <li key={`${c.reservationId}-${c.courtId}`}>
                    <span className="mono">
                      {c.courtName} · {c.from}–{c.to}
                    </span>
                    {' — '}
                    {c.type === 'TOURNAMENT' || c.type === 'BLOCK' || c.type === 'EVENT'
                      ? t('conflictBlock')
                      : (c.customerName ?? t('unknownCustomer'))}
                    {c.customerPhone && c.type !== 'BLOCK' && c.type !== 'TOURNAMENT' ? (
                      <>
                        {' · '}
                        <a href={`tel:${c.customerPhone}`} style={{ color: 'var(--teal)' }}>
                          {c.customerPhone}
                        </a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
        <button type="button" disabled={!valid || busy} onClick={() => check.mutate()} style={secondaryBtn}>
          <BusyLabel busy={check.isPending}>{t('preview')}</BusyLabel>
        </button>
        <button type="button" disabled={!valid || busy} onClick={() => block.mutate()} style={primaryBtn}>
          <BusyLabel busy={block.isPending}>{row.block ? t('reblock') : t('block')}</BusyLabel>
        </button>
        {row.block &&
          (confirmRelease ? (
            <>
              <button type="button" disabled={busy} onClick={() => release.mutate()} style={dangerBtn}>
                <BusyLabel busy={release.isPending}>{t('releaseConfirm')}</BusyLabel>
              </button>
              <button type="button" onClick={() => setConfirmRelease(false)} style={secondaryBtn}>
                {t('cancel')}
              </button>
            </>
          ) : (
            <button type="button" disabled={busy} onClick={() => setConfirmRelease(true)} style={secondaryBtn}>
              {t('release')}
            </button>
          ))}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 14, fontSize: 14 }}>
          <Link href={`/admin/clubs/${clubId}/calendar?date=${row.day}`} style={{ color: 'var(--teal)', fontWeight: 600 }}>
            {t('openCalendar')}
          </Link>
          {row.url && (
            <a href={row.url} target="_blank" rel="noopener" style={{ color: 'var(--ink-2)' }}>
              Smile Cup ↗
            </a>
          )}
        </span>
      </div>
    </article>
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
const fieldLabel: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-2)', minWidth: 130 };
const baseBtn: React.CSSProperties = {
  minHeight: 42,
  padding: '0 16px',
  borderRadius: 'var(--pill)',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const primaryBtn: React.CSSProperties = { ...baseBtn, border: 'none', background: 'var(--green-deep)', color: 'var(--lime)' };
const secondaryBtn: React.CSSProperties = { ...baseBtn, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)' };
const dangerBtn: React.CSSProperties = { ...baseBtn, border: 'none', background: 'var(--clay)', color: '#fff' };
const chipBtn = (on: boolean): React.CSSProperties => ({
  minHeight: 36,
  padding: '0 12px',
  borderRadius: 'var(--pill)',
  border: `1px solid ${on ? 'var(--green-deep)' : 'var(--line-2)'}`,
  background: on ? 'var(--green-deep)' : 'var(--surface)',
  color: on ? '#fff' : 'var(--ink-2)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
});
