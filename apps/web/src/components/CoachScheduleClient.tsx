'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { CoachScheduleDay, CoachScheduleLesson } from '@playslot/contracts';
import { Link, useRouter } from '@/i18n/navigation';
import { getMe, getMyCoachSchedule } from '@/lib/api';
import { CoachHoursEditor } from './CoachHoursEditor';

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function mondayOfThisWeek(): string {
  const d = new Date();
  const day = d.getDay(); // 0 Sun … 6 Sat
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return ymd(d);
}
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return ymd(new Date(y!, m! - 1, d! + n));
}

// ── iCalendar (.ics) export ──
function icsStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
function icsEscape(s: string): string {
  return s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
}
function buildIcs(days: CoachScheduleDay[], summaryLabel: (l: CoachScheduleLesson) => string): string {
  const stamp = icsStamp(new Date().toISOString());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PlaySlot//Coach Schedule//EN', 'CALSCALE:GREGORIAN'];
  for (const day of days) {
    for (const l of day.lessons) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:playslot-lesson-${l.reservationId}@playslot`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${icsStamp(l.startsAt)}`,
        `DTEND:${icsStamp(l.endsAt)}`,
        `SUMMARY:${icsEscape(summaryLabel(l))}`,
        `LOCATION:${icsEscape([l.clubName, l.courtName].filter(Boolean).join(' · '))}`,
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function CoachScheduleClient() {
  const t = useTranslations('CoachSchedule');
  const locale = useLocale();
  const router = useRouter();

  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });
  useEffect(() => {
    if (me.isError) router.replace('/login?returnTo=/me/schedule');
  }, [me.isError, router]);

  const isCoach = me.data?.user.roles.includes('COACH') ?? false;
  const [weekStart, setWeekStart] = useState<string>(mondayOfThisWeek());

  const schedule = useQuery({
    queryKey: ['coachSchedule', weekStart],
    queryFn: () => getMyCoachSchedule(weekStart),
    enabled: me.isSuccess && isCoach,
  });

  const loc = locale === 'bg' ? 'bg-BG' : 'en-US';
  const dfWeekday = new Intl.DateTimeFormat(loc, { weekday: 'long' });
  const dfDay = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short' });
  const dfRange = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long' });
  const todayIso = ymd(new Date());

  if (me.isLoading || me.isError) return <p style={{ color: 'var(--ink-3)' }}>…</p>;

  if (!isCoach) {
    return (
      <div style={card}>
        <p style={{ color: 'var(--ink-2)' }}>{t('coachesOnly')}</p>
        <Link href="/me" style={{ color: 'var(--teal)', marginTop: 12, display: 'inline-block' }}>
          ← {t('backToAccount')}
        </Link>
      </div>
    );
  }

  const days = schedule.data?.days ?? [];
  const total = days.reduce((n, d) => n + d.lessons.length, 0);
  const rangeLabel = `${dfRange.format(new Date(`${weekStart}T00:00:00`))} – ${dfRange.format(
    new Date(`${addDays(weekStart, 6)}T00:00:00`),
  )}`;

  const exportIcs = () => {
    const ics = buildIcs(days, (l) => `${t('lessonWith')} ${l.customerName}`);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `playslot-schedule-${weekStart}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* coach's own working hours */}
      <CoachHoursEditor />

      {/* week navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setWeekStart((w) => addDays(w, -7))} style={navBtn} aria-label={t('prevWeek')}>
          ‹
        </button>
        <div style={{ fontWeight: 700, minWidth: 200, textAlign: 'center' }}>{rangeLabel}</div>
        <button type="button" onClick={() => setWeekStart((w) => addDays(w, 7))} style={navBtn} aria-label={t('nextWeek')}>
          ›
        </button>
        <button type="button" onClick={() => setWeekStart(mondayOfThisWeek())} style={{ ...navBtn, width: 'auto', padding: '0 14px' }}>
          {t('thisWeek')}
        </button>
        <button
          type="button"
          onClick={exportIcs}
          disabled={total === 0}
          style={{
            marginLeft: 'auto',
            minHeight: 44,
            padding: '0 16px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--surface)',
            border: '1px solid var(--line-2)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--ink)',
            cursor: total === 0 ? 'not-allowed' : 'pointer',
            opacity: total === 0 ? 0.5 : 1,
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          <span aria-hidden>↓</span> {t('export')}
        </button>
        <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 13 }}>
          {t('lessonCount', { count: total })}
        </span>
      </div>

      {schedule.isLoading && <p style={{ color: 'var(--ink-3)' }}>…</p>}

      {schedule.isSuccess && (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {days.map((day) => {
            const dt = new Date(`${day.date}T00:00:00`);
            const isToday = day.date === todayIso;
            return (
              <div
                key={day.date}
                style={{
                  ...card,
                  padding: 14,
                  borderColor: isToday ? 'var(--teal)' : 'var(--line)',
                  boxShadow: isToday ? '0 0 0 1px var(--teal)' : 'var(--shadow-sm)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{dfWeekday.format(dt)}</span>
                  <span className="mono" style={{ color: isToday ? 'var(--teal)' : 'var(--ink-3)', fontSize: 12 }}>
                    {dfDay.format(dt)}
                  </span>
                </div>
                {day.lessons.length === 0 ? (
                  <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>{t('noLessons')}</p>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {day.lessons.map((l) => (
                      <LessonRow key={l.reservationId} lesson={l} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LessonRow({ lesson }: { lesson: CoachScheduleLesson }) {
  return (
    <div
      style={{
        borderLeft: '3px solid var(--teal)',
        background: 'var(--surface-2)',
        borderRadius: 'var(--radius-sm)',
        padding: '8px 10px',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span className="mono" style={{ fontWeight: 700 }}>{lesson.time}</span>
        <span style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lesson.customerName}
        </span>
      </div>
      <div className="mono" style={{ color: 'var(--ink-3)', fontSize: 12, marginTop: 2 }}>
        {[lesson.clubName, lesson.courtName].filter(Boolean).join(' · ')}
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  padding: 20,
  boxShadow: 'var(--shadow-sm)',
};
const navBtn: React.CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--surface)',
  border: '1px solid var(--line-2)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--ink)',
  cursor: 'pointer',
  fontSize: 18,
};
