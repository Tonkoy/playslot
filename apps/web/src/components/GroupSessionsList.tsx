'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import type { GroupSessionDto } from '@playslot/contracts';
import { Link, useRouter } from '@/i18n/navigation';
import { getMe, listGroupSessions, registerGroupSession, unregisterGroupSession } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { BusyLabel } from '@/components/Spinner';
import { Avatar } from './Avatar';
import { SessionManage } from './GroupSessionManager';
import { useToast } from './Toast';

/**
 * What a session says about itself, whichever server answered: one that does
 * not know about players' games yet (for the minutes between the site and the
 * API being updated) sends only the coach's fields.
 */
function view(s: GroupSessionDto) {
  return {
    organizerName: s.organizerName ?? s.coachName,
    organizerPhotoUrl: s.organizerPhotoUrl ?? s.coachPhotoUrl,
    kind: s.kind ?? 'TRAINING',
    joinMode: s.joinMode ?? 'OPEN',
    costSplit: s.costSplit ?? 'FEE',
    pending: s.pending ?? false,
  };
}

/**
 * Upcoming sessions people can sign up for: coaches' group trainings, and the
 * games players open on courts they booked. A player joins (or asks to, where
 * the organiser lets people in) and gives up their place with one tap; the
 * organiser sees how it is filling up and manages it right here instead.
 * Optionally scoped to a club and/or a coach.
 */
export function GroupSessionsList({
  clubId,
  coachProfileId,
  timezone = 'Europe/Sofia',
  heading,
}: {
  clubId?: number;
  coachProfileId?: number;
  timezone?: string;
  heading?: string;
}) {
  const t = useTranslations('GroupSessions');
  const tg = useTranslations('Games');
  const tt = useTranslations('Toasts');
  const te = useTranslations('Errors');
  const lv = useTranslations('Levels');
  const locale = useLocale();
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();

  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });
  // The platform admin does not play: they see the list, without joining.
  const isPlatform = me.data?.user.roles.includes('PLATFORM_ADMIN') ?? false;
  const sessions = useQuery({
    // Who is asking changes the answer ("am I in?", "is it mine?").
    queryKey: ['groupSessions', clubId ?? 'all', me.data?.user.id ?? null],
    queryFn: () => listGroupSessions(clubId),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['groupSessions'] });
  const onError = (e: unknown) => toast(errorMessage(e, te, tt('error')), 'error');

  const reg = useMutation({
    mutationFn: (id: number) => registerGroupSession(id),
    onSuccess: (res) => {
      refresh();
      toast(res.status === 'PENDING' ? tg('requestSent') : t('joined'));
    },
    onError,
  });
  const unreg = useMutation({
    mutationFn: (id: number) => unregisterGroupSession(id),
    onSuccess: (_r, id) => {
      refresh();
      toast((sessions.data ?? []).find((x) => x.id === id)?.pending ? tg('withdrawn') : t('left'));
    },
    onError,
  });

  const items = (sessions.data ?? []).filter((s) => !coachProfileId || s.coachProfileId === coachProfileId);

  // A notification or "see the game" leads to one session: bring it into view.
  const count = items.length;
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!count || !id.startsWith('gs-')) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.classList.add('is-target');
    const off = window.setTimeout(() => el.classList.remove('is-target'), 2400);
    return () => window.clearTimeout(off);
  }, [count]);
  if (sessions.isSuccess && items.length === 0) {
    // On the page of its own an empty list says so; inside another page it just isn't there.
    return heading === '' ? <p className="gs-empty">{t('none')}</p> : null;
  }

  const loc = locale === 'bg' ? 'bg-BG' : 'en-GB';
  const part = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(loc, { ...opts, timeZone: timezone }).format(new Date(iso));
  const time = (iso: string) => part(iso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const money = (cents: number, currency: string) =>
    new Intl.NumberFormat(loc, { style: 'currency', currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
  const h = heading ?? t('title');

  return (
    <section style={{ marginTop: 24 }}>
      {h && <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>{h}</h2>}
      <div className="gs-list">
        {items.map((s) => {
          const v = view(s);
          const full = s.spotsLeft <= 0 && !s.registered;
          const busy = (reg.isPending && reg.variables === s.id) || (unreg.isPending && unreg.variables === s.id);
          const byPlayer = s.coachProfileId == null;
          return (
            <article key={s.id} id={`gs-${s.id}`} className={`gs-card${s.mine ? ' is-mine' : ''}${s.registered ? ' is-in' : ''}`}>
              {/* when */}
              <div className="gs-date">
                <small>{part(s.startsAt, { weekday: 'short' })}</small>
                <b>{part(s.startsAt, { day: 'numeric' })}</b>
                <small>{part(s.startsAt, { month: 'long' }).slice(0, 3)}</small>
                <span className="mono">{time(s.startsAt)}</span>
              </div>

              {/* what and with whom */}
              <div className="gs-body">
                <div className="gs-tags">
                  <span className={`gs-tag is-kind${v.kind === 'SPARRING' ? ' is-sparring' : ''}`}>{tg(`kind.${v.kind}`)}</span>
                  <span className="gs-tag is-level">{s.level ? lv(s.level) : t('levelAll')}</span>
                  {s.mine && <span className="gs-tag is-mine">{byPlayer ? tg('yourGame') : t('yourSession')}</span>}
                  {s.registered && <span className="gs-tag is-in">✓ {t('youAreIn')}</span>}
                  {v.pending && <span className="gs-tag is-waiting">{tg('awaitingAnswer')}</span>}
                </div>
                <h3 className="gs-title">{s.title}</h3>
                <div className="gs-coach">
                  <Avatar name={v.organizerName} photoUrl={v.organizerPhotoUrl} size={40} />
                  <span>
                    {byPlayer ? (
                      <span className="gs-coach-name">
                        {v.organizerName} <em className="gs-role">{tg('byPlayer')}</em>
                      </span>
                    ) : (
                      <Link href={`/coaches/${s.coachProfileId}`} className="gs-coach-name">
                        {v.organizerName} <em className="gs-role">{tg('byCoach')}</em>
                      </Link>
                    )}
                    <small>
                      {[s.clubName, s.courtName].filter(Boolean).join(' · ')} · {time(s.startsAt)}–{time(s.endsAt)}
                    </small>
                  </span>
                </div>
                {s.description && <p className="gs-desc">{s.description}</p>}
              </div>

              {/* places, price, action */}
              <div className="gs-side">
                <div className="gs-price">
                  {s.priceCents > 0 ? `${v.costSplit === 'SHARED' ? '≈ ' : ''}${money(s.priceCents, s.currency)}` : t('free')}
                  {v.costSplit !== 'FEE' && <small>{tg(`priceNote.${v.costSplit}`)}</small>}
                </div>
                <div className="gs-meter" aria-hidden>
                  <i style={{ width: `${Math.min(100, (s.registeredCount / s.capacity) * 100)}%` }} />
                </div>
                <div className="gs-spots">
                  {s.mine
                    ? t('registeredOf', { n: s.registeredCount, cap: s.capacity })
                    : full
                      ? t('full')
                      : t('spotsLeft', { n: s.spotsLeft })}
                </div>
                {s.mine || isPlatform ? null : s.registered || v.pending ? (
                  <button type="button" className="gs-btn is-outline" disabled={busy} onClick={() => unreg.mutate(s.id)}>
                    <BusyLabel busy={busy}>{v.pending ? tg('withdraw') : t('leave')}</BusyLabel>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="gs-btn"
                    disabled={busy || full}
                    onClick={() => (me.isSuccess ? reg.mutate(s.id) : router.push('/login?returnTo=/sessions'))}
                  >
                    <BusyLabel busy={busy}>
                      {!me.isSuccess ? t('signInToJoin') : v.joinMode === 'APPROVAL' ? tg('askToJoin') : t('join')}
                    </BusyLabel>
                  </button>
                )}
              </div>

              {/* The organiser manages their own session right here. */}
              {s.mine && (
                <div className="gs-manage">
                  <SessionManage session={s} align="end" />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
