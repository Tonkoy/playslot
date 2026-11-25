'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment, useEffect, useState } from 'react';
import type { CoachScheduleDay, CoachScheduleLesson } from '@playslot/contracts';
import { Link, useRouter } from '@/i18n/navigation';
import { getMe, getMyCoachHours, getMyCoachSchedule } from '@/lib/api';
import { hhmmToMin, minToHHMM } from '@/lib/tz';
import { useMounted } from '@/lib/useMounted';
import { CoachHoursEditor } from './CoachHoursEditor';
import { SkeletonRows } from '@/components/Skeleton';

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function mondayOfThisWeek(): string {
  const d = new Date();
  const day = d.getDay(); // 0 Sun … 6 Sat
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return ymd(d);
}
/** The Monday of the week a day falls in. */
function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  const day = dt.getDay();
  dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day));
  return ymd(dt);
}
const VIEW_KEY = 'playslot.scheduleView';
type View = 'week' | 'day';
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

/** One row of the week grid is an hour. */
const STEP = 60;

type Band = 'bandMorning' | 'bandAfternoon' | 'bandEvening';
function bandOf(min: number): Band {
  if (min < 12 * 60) return 'bandMorning';
  return min < 17 * 60 ? 'bandAfternoon' : 'bandEvening';
}

/** A lesson as minutes of its day, so it can be laid on the hour rows. */
interface Placed {
  lesson: CoachScheduleLesson;
  startMin: number;
  endMin: number;
}
function place(l: CoachScheduleLesson): Placed {
  const startMin = hhmmToMin(l.time);
  const minutes = Math.round((new Date(l.endsAt).getTime() - new Date(l.startsAt).getTime()) / 60_000);
  return { lesson: l, startMin, endMin: startMin + Math.max(minutes, 15) };
}

export function CoachScheduleClient() {
  const t = useTranslations('CoachSchedule');
  // Bands of the day are the calendar's own words.
  const tg = useTranslations('Grid');
  const st = useTranslations('ReservationStatus');
  const locale = useLocale();
  const router = useRouter();
  // The week is drawn around today, which only the browser knows for sure.
  const mounted = useMounted();

  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });
  useEffect(() => {
    if (me.isError) router.replace('/login?returnTo=/me/schedule');
  }, [me.isError, router]);

  const isCoach = me.data?.user.roles.includes('COACH') ?? false;
  const [weekStart, setWeekStart] = useState<string>(mondayOfThisWeek());
  const todayIso = ymd(new Date());
  // The day in focus: its column is marked, and on a phone it is the open one.
  const [focusDay, setFocusDay] = useState<string | null>(todayIso);
  // The whole week, or one day of it. Remembered on this device.
  const [view, setViewState] = useState<View>(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem(VIEW_KEY) === 'day' ? 'day' : 'week';
    } catch {
      return 'week';
    }
  });
  const setView = (v: View) => {
    setViewState(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  };

  const schedule = useQuery({
    queryKey: ['coachSchedule', weekStart],
    queryFn: () => getMyCoachSchedule(weekStart),
    enabled: me.isSuccess && isCoach,
  });
  // Same query the editor below uses: the grid shows the hours it sets.
  const hours = useQuery({ queryKey: ['coachHours'], queryFn: getMyCoachHours, enabled: me.isSuccess && isCoach });

  const loc = locale === 'bg' ? 'bg-BG' : 'en-US';
  const dfShort = new Intl.DateTimeFormat(loc, { weekday: 'short' });
  const dfLong = new Intl.DateTimeFormat(loc, { weekday: 'long' });
  const dfRange = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long' });

  if (!mounted || me.isLoading || me.isError) return <p style={{ color: 'var(--ink-3)' }}>…</p>;

  if (!isCoach) {
    return (
      <div className="acct-card">
        <p style={{ color: 'var(--ink-2)' }}>{t('coachesOnly')}</p>
        <Link href="/me" style={{ color: 'var(--teal)', marginTop: 12, display: 'inline-block' }}>
          ← {t('backToAccount')}
        </Link>
      </div>
    );
  }

  const thisWeek = mondayOfThisWeek();
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const days = schedule.data?.days ?? [];
  const byDate = new Map(days.map((d) => [d.date, d.lessons.map(place)]));
  const lessonsOn = (day: string) => byDate.get(day) ?? [];
  // The one day a day view shows: the day in focus, else today (this week) or Monday.
  const day = focusDay ?? (weekStart === thisWeek ? todayIso : weekStart);
  const shownDays = view === 'day' ? [day] : weekDays;
  const shownLessons = shownDays.flatMap((d) => lessonsOn(d));
  const total = shownLessons.length;
  const rangeLabel =
    view === 'day'
      ? `${dfLong.format(new Date(`${day}T00:00:00`))}, ${dfRange.format(new Date(`${day}T00:00:00`))}`
      : `${dfRange.format(new Date(`${weekStart}T00:00:00`))} – ${dfRange.format(new Date(`${addDays(weekStart, 6)}T00:00:00`))}`;
  const goToWeek = (start: string) => {
    setWeekStart(start);
    // The current week opens on today; any other on nothing in particular
    // (a day view then starts on its Monday).
    setFocusDay(start === thisWeek ? todayIso : null);
  };
  /** Step back or forward: a day at a time in the day view, a week in the week view. */
  const step = (dir: 1 | -1) => {
    if (view === 'week') return goToWeek(addDays(weekStart, 7 * dir));
    const next = addDays(day, dir);
    setFocusDay(next);
    if (mondayOf(next) !== weekStart) setWeekStart(mondayOf(next));
  };

  // ── working hours ──
  const work = new Map((hours.data?.days ?? []).map((d) => [d.weekday, d]));
  // No hours set at all: nothing to mark as "off", so every hour reads as open.
  const hasHours = work.size > 0;
  const weekdayOf = (day: string) => new Date(`${day}T00:00:00`).getDay();
  const worksAt = (day: string, min: number) => {
    if (!hasHours) return true;
    const w = work.get(weekdayOf(day));
    return !!w && min + STEP > w.startMin && min < w.endMin;
  };

  // ── rows: from the earliest start to the latest end of the work and lessons in view ──
  const all = shownLessons;
  const workInView =
    view === 'day' ? [work.get(weekdayOf(day))].filter((w) => w != null) : [...work.values()];
  const starts = [...workInView.map((w) => w.startMin), ...all.map((x) => x.startMin)];
  const ends = [...workInView.map((w) => w.endMin), ...all.map((x) => x.endMin)];
  const lo = starts.length ? Math.floor(Math.min(...starts) / STEP) * STEP : 8 * 60;
  const hi = ends.length ? Math.ceil(Math.max(...ends) / STEP) * STEP : 20 * 60;
  const rows: number[] = [];
  for (let m = lo; m < Math.max(hi, lo + STEP); m += STEP) rows.push(m);
  const startsBand = (i: number) => i === 0 || bandOf(rows[i - 1]!) !== bandOf(rows[i]!);

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isOver = (day: string, min: number) => day < todayIso || (day === todayIso && min + STEP <= nowMin);

  /** Confirmed lessons are filled in; one still waiting for the club is amber. */
  const lessonLook = (l: CoachScheduleLesson) => {
    const waiting = l.status === 'PENDING_APPROVAL' || l.status === 'HOLD' || l.status === 'PENDING_PAYMENT';
    return {
      cls: waiting ? '' : ' is-solid',
      style: (waiting
        ? { '--tone': 'var(--held)', '--tone-soft': 'var(--held-soft)' }
        : { '--tone': 'var(--lesson-fill)', '--tone-soft': 'var(--teal-soft)' }) as React.CSSProperties,
      waiting,
    };
  };
  const where = (l: CoachScheduleLesson) => [l.clubName, l.courtName].filter(Boolean).join(' · ');
  const statusNote = (l: CoachScheduleLesson) => (st.has(l.status) ? st(l.status) : l.status);

  /** One cell of the week grid: a day at an hour. */
  const gridCell = (day: string, min: number, i: number) => {
    const hit = lessonsOn(day).find((x) => x.startMin < min + STEP && x.endMin > min);
    if (hit) {
      const isStart = hit.startMin >= min;
      const isEnd = hit.endMin <= min + STEP;
      // Drawn as one block down its rows, except across a band label (see the club calendar).
      const head = isStart || startsBand(i);
      const joinsNext = !isEnd && i + 1 < rows.length && !startsBand(i + 1);
      const look = lessonLook(hit.lesson);
      const span = `${minToHHMM(hit.startMin)}–${minToHHMM(hit.endMin)}`;
      return (
        <td key={day}>
          <div
            className={`slot acal-entry csch-lesson${look.cls}${head ? '' : ' is-cont'}${joinsNext ? ' is-open-b' : ''}`}
            style={look.style}
            title={`${hit.lesson.customerName} · ${span} · ${where(hit.lesson)}`}
          >
            {head && (
              <>
                <b>{hit.lesson.customerName}</b>
                <small>
                  {isStart
                    ? `${span} · ${look.waiting ? statusNote(hit.lesson) : where(hit.lesson)}`
                    : t('until', { time: minToHHMM(hit.endMin) })}
                </small>
              </>
            )}
          </div>
        </td>
      );
    }
    if (!worksAt(day, min)) {
      return (
        <td key={day}>
          <div className="slot slot-taken">
            <span className="avail-sr">{t('notWorking')}</span>
          </div>
        </td>
      );
    }
    return (
      <td key={day}>
        <div className={`slot csch-open${isOver(day, min) ? ' is-over' : ''}`}>
          <span className="avail-sr">{t('freeHour')}</span>
        </div>
      </td>
    );
  };

  // The file holds what is on screen: the day, or the week.
  const exportIcs = () => {
    const ics = buildIcs(
      days.filter((d) => shownDays.includes(d.date)),
      (l) => `${t('lessonWith')} ${l.customerName}`,
    );
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `playslot-schedule-${view === 'day' ? day : `week-${weekStart}`}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="avail-legend">
        <span>
          <i className="avail-swatch" style={{ background: 'var(--lesson-fill)' }} />
          {t('legendLesson')}
        </span>
        <span>
          <i className="avail-swatch" style={{ background: 'var(--green-soft-2)' }} />
          {t('legendOpen')}
        </span>
        {hasHours && (
          <span>
            <i className="avail-swatch slot-taken" />
            {t('notWorking')}
          </span>
        )}
      </div>

      {/* The week as a strip of days, like the calendar's; arrows move a week. */}
      <div className="avail-bar">
        <div className="avail-days" role="group" aria-label={rangeLabel}>
          <button type="button" className="avail-day acal-step" onClick={() => step(-1)} aria-label={view === 'day' ? t('prevDay') : t('prevWeek')}>
            ‹
          </button>
          {weekStart !== thisWeek && (
            <button type="button" className="avail-day" onClick={() => goToWeek(thisWeek)}>
              <small>&nbsp;</small>
              <b style={{ fontSize: 14 }}>{t('thisWeek')}</b>
              <em />
            </button>
          )}
          {weekDays.map((d) => {
            const n = lessonsOn(d).length;
            const on = view === 'day' ? d === day : d === focusDay;
            return (
              <button
                key={d}
                type="button"
                className={`avail-day${on ? ' is-on' : ''}`}
                aria-pressed={on}
                // A day view always has a day; in the week view a second tap lets go of it.
                onClick={() => setFocusDay(view === 'week' && d === focusDay ? null : d)}
              >
                <small>{d === todayIso ? tg('todayShort') : dfShort.format(new Date(`${d}T00:00:00`))}</small>
                <b>{Number(d.slice(8, 10))}</b>
                <em className={n === 0 ? 'is-none' : undefined}>{schedule.isSuccess ? t('dayLessons', { count: n }) : ''}</em>
              </button>
            );
          })}
          <button type="button" className="avail-day acal-step" onClick={() => step(1)} aria-label={view === 'day' ? t('nextDay') : t('nextWeek')}>
            ›
          </button>
        </div>

        <div className="avail-seg" role="group" aria-label={t('view')}>
          {(['week', 'day'] as const).map((v) => (
            <button key={v} type="button" className={v === view ? 'is-on' : undefined} aria-pressed={v === view} onClick={() => setView(v)}>
              {t(v === 'week' ? 'viewWeek' : 'viewDay')}
            </button>
          ))}
        </div>
        <button type="button" className="acal-block" onClick={exportIcs} disabled={total === 0}>
          <span aria-hidden>↓</span> {view === 'day' ? t('exportDay') : t('exportWeek')}
        </button>
      </div>

      <p className="acal-day mono" style={{ textTransform: 'none' }}>
        {rangeLabel} · {t('lessonsInView', { count: total })}
      </p>

      {schedule.isLoading && <SkeletonRows />}

      {/* Desktop: hours down, the seven days across. */}
      {schedule.isSuccess && (
        <div className="avail-table-wrap">
          <table className="avail-table acal-table" style={{ minWidth: 64 + shownDays.length * 108 }}>
            <colgroup>
              <col style={{ width: 64 }} />
              {shownDays.map((d) => (
                <col key={d} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="avail-time" style={{ background: 'var(--surface-2)' }}>
                  <span className="avail-sr">{tg('time')}</span>
                </th>
                {shownDays.map((d) => (
                  <th
                    key={d}
                    scope="col"
                    className={`${d === todayIso ? 'csch-today' : ''}${view === 'week' && d === focusDay ? ' csch-focus' : ''}`}
                    style={{ textTransform: 'capitalize' }}
                  >
                    {(view === 'day' ? dfLong : dfShort).format(new Date(`${d}T00:00:00`))} {Number(d.slice(8, 10))}
                    <small style={{ textTransform: 'none' }}>
                      {d === todayIso ? tg('todayShort') : t('dayLessons', { count: lessonsOn(d).length })}
                    </small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((min, i) => (
                <Fragment key={min}>
                  {startsBand(i) && (
                    <tr>
                      <th colSpan={shownDays.length + 1} className="avail-band" scope="colgroup">
                        <div className="avail-clip">{tg(bandOf(min))}</div>
                      </th>
                    </tr>
                  )}
                  <tr>
                    <th scope="row" className="avail-time mono">
                      <div className="avail-clip avail-clip-time">{minToHHMM(min)}</div>
                    </th>
                    {shownDays.map((d) => gridCell(d, min, i))}
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Phone: one row per day; tapping a day unfolds its lessons. */}
      {schedule.isSuccess && (
        <div className="avail-list">
          {shownDays.map((day) => {
            const list = lessonsOn(day);
            const w = work.get(weekdayOf(day));
            // In the day view the one day is simply open.
            const open = (view === 'day' || focusDay === day) && list.length > 0;
            const label = (
              <>
                <span className="avail-hour-time mono csch-daylabel">
                  {dfShort.format(new Date(`${day}T00:00:00`))} {Number(day.slice(8, 10))}
                </span>
                <span className="avail-hour-info">
                  {list.length > 0 ? <b>{t('dayLessons', { count: list.length })}</b> : t('noLessons')}
                  {hasHours && (
                    <span style={{ color: 'var(--ink-3)' }}>
                      {' · '}
                      {w ? `${minToHHMM(w.startMin)}–${minToHHMM(w.endMin)}` : t('dayOff')}
                    </span>
                  )}
                  {day === todayIso && <span className="avail-badge">{tg('todayShort')}</span>}
                </span>
              </>
            );
            if (list.length === 0) {
              return (
                <div key={day} className="avail-hour is-full">
                  <div className="avail-hour-top">{label}</div>
                </div>
              );
            }
            return (
              <div key={day} className={`avail-hour${open ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="avail-hour-top"
                  aria-expanded={open}
                  aria-label={dfLong.format(new Date(`${day}T00:00:00`))}
                  onClick={() => setFocusDay(open ? null : day)}
                >
                  {label}
                  <span className="avail-hour-chev" aria-hidden>
                    ›
                  </span>
                </button>
                <div className={`avail-fold${open ? ' is-open' : ''}`} inert={!open}>
                  <div className="avail-fold-inner">
                    <div className="avail-courts">
                      {list.map((x, i) => {
                        const look = lessonLook(x.lesson);
                        return (
                          <div
                            key={x.lesson.reservationId}
                            className={`avail-court acal-tile csch-lesson${look.cls}`}
                            style={{ ...look.style, '--i': i } as React.CSSProperties}
                          >
                            <span>
                              {minToHHMM(x.startMin)}–{minToHHMM(x.endMin)} · {x.lesson.customerName}
                              <small>
                                {where(x.lesson)}
                                {look.waiting ? ` · ${statusNote(x.lesson)}` : ''}
                              </small>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* The hours the grid is drawn from. */}
      <div style={{ marginTop: 20 }}>
        <CoachHoursEditor />
      </div>
    </div>
  );
}
