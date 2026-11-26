'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import type { GroupSessionDto } from '@playslot/contracts';
import { Link, useRouter } from '@/i18n/navigation';
import { getMe, listGroupSessions, registerGroupSession, unregisterGroupSession } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { BusyLabel } from '@/components/Spinner';
import { Avatar } from './Avatar';
import { SessionManage } from './GroupSessionManager';
import { useToast } from './Toast';

/**
 * Upcoming coach-hosted group trainings. A player joins or gives up their
 * place with one tap; the coach who runs a training sees how it is filling up
 * and a way to manage it instead. Optionally scoped to a club and/or a coach.
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
  const tt = useTranslations('Toasts');
  const te = useTranslations('Errors');
  const lv = useTranslations('Levels');
  const locale = useLocale();
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();

  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });
  const sessions = useQuery({
    // Who is asking changes the answer ("am I in?", "is it mine?").
    queryKey: ['groupSessions', clubId ?? 'all', me.data?.user.id ?? null],
    queryFn: () => listGroupSessions(clubId),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['groupSessions'] });
  const onError = (e: unknown) => toast(errorMessage(e, te, tt('error')), 'error');

  const reg = useMutation({
    mutationFn: (id: number) => registerGroupSession(id),
    onSuccess: () => {
      refresh();
      toast(t('joined'));
    },
    onError,
  });
  const unreg = useMutation({
    mutationFn: (id: number) => unregisterGroupSession(id),
    onSuccess: () => {
      refresh();
      toast(t('left'));
    },
    onError,
  });

  const items = (sessions.data ?? []).filter((s) => !coachProfileId || s.coachProfileId === coachProfileId);
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
          const full = s.spotsLeft <= 0 && !s.registered;
          const busy = (reg.isPending && reg.variables === s.id) || (unreg.isPending && unreg.variables === s.id);
          return (
            <article key={s.id} className={`gs-card${s.mine ? ' is-mine' : ''}${s.registered ? ' is-in' : ''}`}>
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
                  <span className="gs-tag is-level">{s.level ? lv(s.level) : t('levelAll')}</span>
                  {s.mine && <span className="gs-tag is-mine">{t('yourSession')}</span>}
                  {s.registered && <span className="gs-tag is-in">✓ {t('youAreIn')}</span>}
                </div>
                <h3 className="gs-title">{s.title}</h3>
                <div className="gs-coach">
                  <Avatar name={s.coachName} photoUrl={s.coachPhotoUrl} size={40} />
                  <span>
                    <Link href={`/coaches/${s.coachProfileId}`} className="gs-coach-name">
                      {s.coachName}
                    </Link>
                    <small>
                      {[s.clubName, s.courtName].filter(Boolean).join(' · ')} · {time(s.startsAt)}–{time(s.endsAt)}
                    </small>
                  </span>
                </div>
                {s.description && <p className="gs-desc">{s.description}</p>}
              </div>

              {/* places, price, action */}
              <div className="gs-side">
                <div className="gs-price">{s.priceCents > 0 ? money(s.priceCents, s.currency) : t('free')}</div>
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
                {s.mine ? null : s.registered ? (
                  <button type="button" className="gs-btn is-outline" disabled={busy} onClick={() => unreg.mutate(s.id)}>
                    <BusyLabel busy={busy}>{t('leave')}</BusyLabel>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="gs-btn"
                    disabled={busy || full}
                    onClick={() => (me.isSuccess ? reg.mutate(s.id) : router.push('/login?returnTo=/sessions'))}
                  >
                    <BusyLabel busy={busy}>{me.isSuccess ? t('join') : t('signInToJoin')}</BusyLabel>
                  </button>
                )}
              </div>

              {/* The coach manages their own training right here. */}
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
