'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { COACH_LEVELS, type GroupSessionDto, type GroupSessionKind, type JoinMode } from '@playslot/contracts';
import {
  approveGroupRegistration,
  cancelGroupSession,
  createGroupSession,
  declineGroupRegistration,
  getCoachAvailability,
  getCoachById,
  getMyGroupSessions,
  updateGroupSession,
} from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { localHHMM } from '@/lib/tz';
import { SkeletonRows } from '@/components/Skeleton';
import { BusyLabel } from '@/components/Spinner';
import { Avatar } from './Avatar';
import { Collapse } from './Collapse';
import { Modal } from './Modal';
import { ChoiceCards } from './ChoiceCards';
import { useToast } from './Toast';

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type Level = (typeof COACH_LEVELS)[number] | null;

/** "Who is it for": every level, or one of them. */
export function LevelPicker({ value, onChange }: { value: Level; onChange: (v: Level) => void }) {
  const t = useTranslations('GroupSessions');
  const lv = useTranslations('Levels');
  const options: { value: Level; label: string }[] = [
    { value: null, label: t('levelAll') },
    ...COACH_LEVELS.map((l) => ({ value: l, label: lv(l) })),
  ];
  return (
    <div>
      <div className="acct-field" style={{ marginBottom: 8 }}>
        {t('level')}
      </div>
      <div className="coach-chips" role="radiogroup" aria-label={t('level')}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value ?? 'all'}
              type="button"
              role="radio"
              aria-checked={on}
              className={`coach-chip${on ? ' is-on' : ''}`}
              onClick={() => onChange(o.value)}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Day, length and a free start time for the coach at a club; a start comes with a court that is free then. */
function SlotPicker({
  coachProfileId,
  clubId,
  date,
  durationMin,
  start,
  onDate,
  onDuration,
  onPick,
}: {
  coachProfileId: number;
  clubId: number | null;
  date: string;
  durationMin: number;
  start: string | null;
  onDate: (v: string) => void;
  onDuration: (v: number) => void;
  onPick: (start: string, courtId: number) => void;
}) {
  const t = useTranslations('GroupSessions');
  const avail = useQuery({
    queryKey: ['coachAvail', coachProfileId, clubId, date],
    queryFn: () => getCoachAvailability(coachProfileId, clubId!, date),
    enabled: clubId != null,
  });
  const freeSlots = (avail.data?.slots ?? []).filter(
    (s) => s.state === 'FREE' && s.compatibleCourtIds.length > 0,
  );

  return (
    <div>
      <div className="acct-grid2" style={{ marginTop: 0 }}>
        <label className="acct-field">
          {t('date')}
          <input
            type="date"
            value={date}
            onChange={(e) => onDate(e.target.value)}
            className="acct-input"
          />
        </label>
        <label className="acct-field">
          {t('duration')}
          <select
            value={durationMin}
            onChange={(e) => onDuration(Number(e.target.value))}
            className="acct-input"
          >
            {[60, 90, 120].map((d) => (
              <option key={d} value={d}>
                {d} {t('min')}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="acct-field" style={{ margin: '14px 0 8px' }}>
        {t('pickSlot')}
      </div>
      {avail.isLoading && <SkeletonRows />}
      {avail.isSuccess && freeSlots.length === 0 && <p className="acct-help">{t('noSlots')}</p>}
      <div className="coach-chips">
        {freeSlots.map((s) => {
          const on = start === s.start;
          return (
            <button
              key={s.start}
              type="button"
              aria-pressed={on}
              className={`coach-chip mono${on ? ' is-on' : ''}`}
              onClick={() => onPick(s.start, s.compatibleCourtIds[0]!)}
            >
              {localHHMM(s.start)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** What both halves below need: fresh lists after a change, and errors in words. */
function useSessionTools() {
  const tt = useTranslations('Toasts');
  const te = useTranslations('Errors');
  const qc = useQueryClient();
  const toast = useToast();
  return {
    toast,
    tt,
    refresh: () => {
      qc.invalidateQueries({ queryKey: ['myGroupSessions'] });
      qc.invalidateQueries({ queryKey: ['groupSessions'] });
      qc.invalidateQueries({ queryKey: ['coachAvail'] });
      qc.invalidateQueries({ queryKey: ['coachSchedule'] });
    },
    onError: (e: unknown) => toast(errorMessage(e, te, tt('error')), 'error'),
  };
}

/**
 * What the organiser — a coach, or the player who opened a game — can do with
 * a session of theirs, wherever it is shown: see who signed up, let in or turn
 * away those who asked to join, edit it, call it off. The list and the cancel
 * question open in place, under the buttons.
 */
export function SessionManage({
  session,
  align = 'start',
}: {
  session: GroupSessionDto;
  /** Where the buttons sit in their row. */
  align?: 'start' | 'end';
}) {
  const t = useTranslations('GroupSessions');
  const locale = useLocale();
  const { toast, tt, refresh, onError } = useSessionTools();
  const lv = useTranslations('Levels');
  const byPlayer = session.coachProfileId == null;
  const waiting = session.pendingCount ?? 0;
  // Someone waiting for an answer is the reason to look: start with the list open.
  const [peopleOpen, setPeopleOpen] = useState(waiting > 0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [editing, setEditing] = useState(false);

  const cancel = useMutation({
    mutationFn: () => cancelGroupSession(session.id),
    onSuccess: () => {
      refresh();
      setConfirmCancel(false);
      toast(tt('sessionCancelled'));
    },
    onError,
  });

  const answer = useMutation({
    mutationFn: (a: { userId: number; let: boolean }) =>
      a.let ? approveGroupRegistration(session.id, a.userId) : declineGroupRegistration(session.id, a.userId),
    onSuccess: (_s, a) => {
      refresh();
      toast(a.let ? t('approvedToast') : t('removedToast'));
    },
    onError,
  });

  const live = !session.cancelled && new Date(session.endsAt).getTime() > Date.now();
  const people = session.participants ?? [];
  const loc = locale === 'bg' ? 'bg-BG' : 'en-GB';
  const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(loc, { ...opts, timeZone: 'Europe/Sofia' });
  const day = fmt({ weekday: 'short', day: 'numeric', month: 'long' });
  const time = fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const when = `${day.format(new Date(session.startsAt))}, ${time.format(new Date(session.startsAt))}–${time.format(new Date(session.endsAt))}`;

  return (
    <div className="gsm-manage">
      <div className="gsm-actions" style={align === 'end' ? { justifyContent: 'flex-end' } : undefined}>
        <button type="button" className="acct-btn" aria-expanded={peopleOpen} onClick={() => setPeopleOpen((v) => !v)}>
          {t('participants', { n: session.registeredCount })}
          {waiting > 0 && <span className="gsm-waiting">{t('waitingCount', { n: waiting })}</span>}
        </button>
        {live && (
          <>
            <button type="button" className="acct-btn" onClick={() => setEditing(true)}>
              {t('edit')}
            </button>
            <button type="button" className="acct-btn is-danger" onClick={() => setConfirmCancel(true)}>
              {t('cancel')}
            </button>
          </>
        )}
      </div>

      <Collapse open={peopleOpen}>
        <div className="gsm-people">
          {people.length === 0 ? (
            <p className="acct-help">{t('noParticipants')}</p>
          ) : (
            <ul className="gsm-plist">
              {people.map((p) => {
                const busy = answer.isPending && answer.variables?.userId === p.userId;
                return (
                  <li key={p.userId} className={p.status === 'PENDING' ? 'is-waiting' : undefined}>
                    <Avatar name={p.name} photoUrl={p.photoUrl} size={36} />
                    <span className="gsm-pname">
                      <b>{p.name}</b>
                      <small>
                        {[p.level && lv.has(p.level) ? lv(p.level) : null, p.status === 'PENDING' ? t('asksToJoin') : null]
                          .filter(Boolean)
                          .join(' · ') || t('hasPlace')}
                      </small>
                    </span>
                    {live && (
                      <span className="gsm-pacts">
                        {p.status === 'PENDING' && (
                          <button
                            type="button"
                            className="acct-btn is-primary"
                            disabled={busy || session.spotsLeft <= 0}
                            title={session.spotsLeft <= 0 ? t('full') : undefined}
                            onClick={() => answer.mutate({ userId: p.userId, let: true })}
                          >
                            {t('approve')}
                          </button>
                        )}
                        <button type="button" className="acct-btn is-quiet" disabled={busy} onClick={() => answer.mutate({ userId: p.userId, let: false })}>
                          {p.status === 'PENDING' ? t('decline') : t('remove')}
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Collapse>

      <Collapse open={confirmCancel}>
        <div className="gsm-confirm" role="alert">
          <span>{byPlayer ? t('cancelConfirmGame') : t('cancelConfirm')}</span>
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="acct-btn is-danger" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              <BusyLabel busy={cancel.isPending}>{t('cancelYes')}</BusyLabel>
            </button>
            <button type="button" className="acct-btn" onClick={() => setConfirmCancel(false)}>
              {t('cancelNo')}
            </button>
          </span>
        </div>
      </Collapse>

      {editing && (
        <EditSession
          session={session}
          when={when}
          onClose={() => setEditing(false)}
          onSaved={(moved) => {
            refresh();
            setEditing(false);
            toast(moved ? t('savedMoved') : t('saved'));
          }}
        />
      )}
    </div>
  );
}

/**
 * The trainings the coach runs. Renders nothing until there is at least one,
 * so it can sit at the top of the coach's page.
 */
export function MyGroupSessions() {
  const t = useTranslations('GroupSessions');
  const lv = useTranslations('Levels');
  const locale = useLocale();

  const mine = useQuery({ queryKey: ['myGroupSessions'], queryFn: getMyGroupSessions });

  const loc = locale === 'bg' ? 'bg-BG' : 'en-GB';
  const tz = 'Europe/Sofia';
  const dfDay = new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', month: 'long', timeZone: tz });
  const dfTime = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz });
  const money = (cents: number, currency: string) =>
    new Intl.NumberFormat(loc, { style: 'currency', currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

  // Live ones first, soonest on top; cancelled and finished after them.
  const now = Date.now();
  const isLive = (s: GroupSessionDto) => !s.cancelled && new Date(s.endsAt).getTime() > now;
  const sessions = [...(mine.data ?? [])].sort(
    (a, b) => Number(isLive(b)) - Number(isLive(a)) || a.startsAt.localeCompare(b.startsAt),
  );
  if (sessions.length === 0) return null;

  return (
    <section className="acct-card">
      <h2 className="acct-h2">{t('mine')}</h2>
      <div className="gsm-list">
        {sessions.map((s) => {
          const live = isLive(s);
          return (
            <article key={s.id} className={`gsm-item${live ? '' : ' is-off'}`}>
              <div className="gsm-when">
                <b>{dfDay.format(new Date(s.startsAt))}</b>
                <span className="mono">
                  {dfTime.format(new Date(s.startsAt))}–{dfTime.format(new Date(s.endsAt))}
                </span>
              </div>
              <div className="gsm-body">
                <div className="gsm-title">
                  <strong>{s.title}</strong>
                  <span className="gs-tag">{s.level ? lv(s.level) : t('levelAll')}</span>
                  {s.cancelled && <span className="gs-tag is-off">{t('cancelledTag')}</span>}
                  {!s.cancelled && !live && <span className="gs-tag is-off">{t('pastTag')}</span>}
                </div>
                <p className="gsm-meta">
                  {[s.clubName, s.courtName].filter(Boolean).join(' · ')} ·{' '}
                  {s.priceCents > 0 ? t('perPlayer', { price: money(s.priceCents, s.currency) }) : t('free')}
                </p>
                <div className="gs-meter" aria-hidden>
                  <i style={{ width: `${Math.min(100, (s.registeredCount / s.capacity) * 100)}%` }} />
                </div>
                <p className="gsm-meta">{t('registeredOf', { n: s.registeredCount, cap: s.capacity })}</p>
                <SessionManage session={s} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The form that opens a new group training: a free slot, then what it is and
 * for whom. Lives in a dialog (`onCreated` closes it); the dialog gives the title.
 */
export function GroupSessionManager({
  coachProfileId,
  onCreated,
}: {
  coachProfileId: number;
  onCreated?: () => void;
}) {
  const t = useTranslations('GroupSessions');
  const { toast, tt, refresh, onError } = useSessionTools();

  const coach = useQuery({
    queryKey: ['coachSelf', coachProfileId],
    queryFn: () => getCoachById(coachProfileId),
  });
  const clubs = coach.data?.clubs ?? [];

  const [clubId, setClubId] = useState<number | null>(null);
  const effectiveClub = clubId ?? clubs[0]?.id ?? null;
  const [date, setDate] = useState(tomorrow());
  const [durationMin, setDurationMin] = useState(60);
  const [start, setStart] = useState<string | null>(null);
  const [courtId, setCourtId] = useState<number | null>(null);
  const [capacity, setCapacity] = useState(4);
  const [price, setPrice] = useState(1500);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState<Level>(null);

  const create = useMutation({
    mutationFn: () =>
      createGroupSession({
        clubId: effectiveClub!,
        courtId: courtId!,
        startsAt: start!,
        durationMin,
        capacity,
        priceCents: price,
        title,
        description: description || undefined,
        level,
      }),
    onSuccess: () => {
      refresh();
      setStart(null);
      setCourtId(null);
      setTitle('');
      setDescription('');
      setLevel(null);
      toast(tt('sessionCreated'));
      onCreated?.();
    },
    onError,
  });

  const canCreate =
    effectiveClub != null && start != null && courtId != null && title.trim().length > 0;

  return (
    <div>
      <p className="acct-help" style={{ marginBottom: 16 }}>
        {t('createHelp')}
      </p>

      {clubs.length > 1 && (
        <label className="acct-field" style={{ marginBottom: 14 }}>
          {t('club')}
          <select
            value={effectiveClub ?? ''}
            onChange={(e) => {
              setClubId(Number(e.target.value));
              setStart(null);
              setCourtId(null);
            }}
            className="acct-input"
          >
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <SlotPicker
        coachProfileId={coachProfileId}
        clubId={effectiveClub}
        date={date}
        durationMin={durationMin}
        start={start}
        onDate={(v) => {
          setDate(v);
          setStart(null);
          setCourtId(null);
        }}
        onDuration={setDurationMin}
        onPick={(s, c) => {
          setStart(s);
          setCourtId(c);
        }}
      />

      <label className="acct-field" style={{ marginTop: 16 }}>
        {t('sessionTitle')}
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="acct-input" />
      </label>

      <div style={{ marginTop: 16 }}>
        <LevelPicker value={level} onChange={setLevel} />
      </div>

      <div className="acct-grid2">
        <label className="acct-field">
          {t('capacity')}
          <input
            type="number"
            min={2}
            max={50}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            className="acct-input"
          />
        </label>
        <label className="acct-field">
          {t('pricePerPlayer')}
          <input
            type="number"
            min={0}
            step="0.01"
            value={price / 100}
            onChange={(e) => setPrice(Math.round(Number(e.target.value) * 100))}
            className="acct-input"
          />
        </label>
      </div>

      <label className="acct-field" style={{ marginTop: 16 }}>
        {t('sessionDescription')}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="acct-input"
          style={{ minHeight: 84, padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }}
        />
      </label>

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          className="acct-btn is-primary"
          onClick={() => create.mutate()}
          disabled={!canCreate || create.isPending}
          style={{
            minHeight: 46,
            padding: '0 22px',
            ...(canCreate ? {} : { opacity: 0.5, cursor: 'not-allowed' }),
          }}
        >
          <BusyLabel busy={create.isPending}>{t('createAndInvite')}</BusyLabel>
        </button>
        <p className="acct-help" style={{ marginTop: 8 }}>
          {t('inviteNote')}
        </p>
      </div>
    </div>
  );
}

/**
 * Edit a session. A coach's training: its words, level, size and price — and,
 * on request, its day and hour. A player's game: its words, level, size, how
 * people get in and who pays for the court; its day and hour are its booking's.
 */
function EditSession({
  session,
  when,
  onClose,
  onSaved,
}: {
  session: GroupSessionDto;
  when: string;
  onClose: () => void;
  onSaved: (moved: boolean) => void;
}) {
  const t = useTranslations('GroupSessions');
  const tgm = useTranslations('Games');
  const coachProfileId = session.coachProfileId;
  const byPlayer = coachProfileId == null;
  const [kind, setKind] = useState<GroupSessionKind>(session.kind ?? 'TRAINING');
  const [joinMode, setJoinMode] = useState<JoinMode>(session.joinMode ?? 'OPEN');
  const [costSplit, setCostSplit] = useState<'ORGANIZER' | 'SHARED'>(session.costSplit === 'ORGANIZER' ? 'ORGANIZER' : 'SHARED');
  const tt = useTranslations('Toasts');
  const te = useTranslations('Errors');
  const toast = useToast();

  const [title, setTitle] = useState(session.title);
  const [description, setDescription] = useState(session.description ?? '');
  const [level, setLevel] = useState<Level>(
    (COACH_LEVELS as readonly string[]).includes(session.level ?? '')
      ? (session.level as Level)
      : null,
  );
  const [capacity, setCapacity] = useState(session.capacity);
  const [price, setPrice] = useState(session.priceCents);

  // Moving it is a separate, deliberate step: it emails everyone signed up.
  const [moving, setMoving] = useState(false);
  const [date, setDate] = useState(() =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia' }).format(
      new Date(session.startsAt),
    ),
  );
  const [durationMin, setDurationMin] = useState(
    Math.round(
      (new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60_000,
    ),
  );
  const [start, setStart] = useState<string | null>(null);
  const [courtId, setCourtId] = useState<number | null>(null);

  const tooSmall = capacity < session.registeredCount;
  const willMove = moving && start != null && courtId != null;
  const canSave = title.trim().length > 0 && !tooSmall && (!moving || willMove);

  const save = useMutation({
    mutationFn: () =>
      updateGroupSession(session.id, {
        title: title.trim(),
        description: description.trim() || null,
        level,
        capacity,
        ...(byPlayer ? { kind, joinMode, costSplit } : { priceCents: price }),
        ...(willMove ? { slot: { courtId: courtId!, startsAt: start!, durationMin } } : {}),
      }),
    onSuccess: () => onSaved(willMove),
    onError: (e) => toast(errorMessage(e, te, tt('error')), 'error'),
  });

  return (
    <Modal open onClose={onClose} title={byPlayer ? tgm('editTitle') : t('editTitle')}>
      <div style={{ display: 'grid', gap: 16 }}>
        <label className="acct-field">
          {t('sessionTitle')}
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="acct-input" />
        </label>

        <LevelPicker value={level} onChange={setLevel} />

        <div className="acct-grid2" style={{ marginTop: 0 }}>
          <label className="acct-field">
            {t('capacity')}
            <input
              type="number"
              min={Math.max(byPlayer ? 1 : 2, session.registeredCount)}
              max={50}
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              className="acct-input"
              aria-invalid={tooSmall}
            />
            {tooSmall && <span className="acct-help is-error">{te('below_registered')}</span>}
          </label>
          {!byPlayer && (
            <label className="acct-field">
              {t('pricePerPlayer')}
              <input
                type="number"
                min={0}
                step="0.01"
                value={price / 100}
                onChange={(e) => setPrice(Math.round(Number(e.target.value) * 100))}
                className="acct-input"
              />
            </label>
          )}
        </div>

        {byPlayer && (
          <>
            <ChoiceCards
              label={tgm('kindLabel')}
              value={kind}
              onChange={setKind}
              options={[
                { value: 'SPARRING', title: tgm('kind.SPARRING'), help: tgm('kindHelp.SPARRING') },
                { value: 'TRAINING', title: tgm('kind.TRAINING'), help: tgm('kindHelp.TRAINING') },
              ]}
            />
            <ChoiceCards
              label={tgm('joinLabel')}
              value={joinMode}
              onChange={setJoinMode}
              options={[
                { value: 'OPEN', title: tgm('join.OPEN'), help: tgm('joinHelp.OPEN') },
                { value: 'APPROVAL', title: tgm('join.APPROVAL'), help: tgm('joinHelp.APPROVAL') },
              ]}
            />
            <ChoiceCards
              label={tgm('costLabel')}
              value={costSplit}
              onChange={setCostSplit}
              options={[
                { value: 'SHARED', title: tgm('cost.SHARED'), help: tgm('costHelp.SHAREDplain') },
                { value: 'ORGANIZER', title: tgm('cost.ORGANIZER'), help: tgm('costHelp.ORGANIZERplain') },
              ]}
            />
          </>
        )}

        <label className="acct-field">
          {t('sessionDescription')}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="acct-input"
            style={{ minHeight: 84, padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }}
          />
        </label>

        {/* day and hour */}
        <div className="gsm-move">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <span>
              <span className="acct-field">{t('dayAndTime')}</span>
              <span className="mono" style={{ display: 'block', marginTop: 4, fontSize: 14 }}>
                {when}
              </span>
            </span>
            {coachProfileId != null && (
              <button
                type="button"
                className="acct-btn"
                aria-expanded={moving}
                onClick={() => setMoving((v) => !v)}
              >
                {moving ? t('keepSlot') : t('changeSlot')}
              </button>
            )}
          </div>
          {byPlayer && <p className="acct-help" style={{ marginTop: 8 }}>{tgm('timeIsBookings')}</p>}
          <Collapse open={moving && coachProfileId != null}>
            <div style={{ paddingTop: 14 }}>
              <SlotPicker
                coachProfileId={coachProfileId ?? 0}
                clubId={session.clubId}
                date={date}
                durationMin={durationMin}
                start={start}
                onDate={(v) => {
                  setDate(v);
                  setStart(null);
                  setCourtId(null);
                }}
                onDuration={setDurationMin}
                onPick={(s, c) => {
                  setStart(s);
                  setCourtId(c);
                }}
              />
              {session.registeredCount > 0 && (
                <p className="acct-help" style={{ marginTop: 10 }}>
                  {t('moveNote', { n: session.registeredCount })}
                </p>
              )}
            </div>
          </Collapse>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="acct-btn is-primary"
            disabled={!canSave || save.isPending}
            onClick={() => save.mutate()}
            style={canSave ? undefined : { opacity: 0.5, cursor: 'not-allowed' }}
          >
            <BusyLabel busy={save.isPending}>{t('save')}</BusyLabel>
          </button>
          <button type="button" className="acct-btn" onClick={onClose}>
            {t('close')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
