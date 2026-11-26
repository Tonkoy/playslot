'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { courtShareCents, type GroupSessionDto, type GroupSessionKind, type JoinMode } from '@playslot/contracts';
import { Link } from '@/i18n/navigation';
import { openGame } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { BusyLabel } from '@/components/Spinner';
import { ChoiceCards } from './ChoiceCards';
import { LevelPicker, type Level } from './GroupSessionManager';
import { Modal } from './Modal';
import { PushNotificationToggle } from './PushNotificationToggle';
import { useToast } from './Toast';

export interface OpenableBooking {
  id: number;
  priceCents: number;
  currency: string;
  /** "Sat 28 Nov, 18:00 · Club" — said back to the player at the top of the form. */
  summary: string;
}

/**
 * "Invite players" on a court booking: opens the booking to other players as
 * a game — sparring or a training among players. The day, hour and court are
 * the booking's; the form asks only what the game is and how people get in.
 */
export function OpenGameButton({ booking, className, style }: { booking: OpenableBooking; className?: string; style?: React.CSSProperties }) {
  const t = useTranslations('Games');
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} style={style} onClick={() => setOpen(true)}>
        {t('invite')}
      </button>
      {open && <OpenGameDialog booking={booking} onClose={() => setOpen(false)} />}
    </>
  );
}

function OpenGameDialog({ booking, onClose }: { booking: OpenableBooking; onClose: () => void }) {
  const t = useTranslations('Games');
  const tg = useTranslations('GroupSessions');
  const tt = useTranslations('Toasts');
  const te = useTranslations('Errors');
  const locale = useLocale();
  const qc = useQueryClient();
  const toast = useToast();

  const [kind, setKind] = useState<GroupSessionKind>('SPARRING');
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState<Level>(null);
  const [places, setPlaces] = useState(1);
  const [joinMode, setJoinMode] = useState<JoinMode>('OPEN');
  const [costSplit, setCostSplit] = useState<'ORGANIZER' | 'SHARED'>('SHARED');
  const [description, setDescription] = useState('');
  const [opened, setOpened] = useState<GroupSessionDto | null>(null);

  const money = (cents: number) =>
    new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-GB', {
      style: 'currency',
      currency: booking.currency,
      maximumFractionDigits: cents % 100 ? 2 : 0,
    }).format(cents / 100);
  const validPlaces = Number.isInteger(places) && places >= 1 && places <= 30;
  const share = validPlaces ? courtShareCents(booking.priceCents, places) : 0;
  // The title is optional to type: the kind of game is a title already.
  const finalTitle = title.trim() || t(`kind.${kind}`);

  const create = useMutation({
    mutationFn: () =>
      openGame({
        reservationId: booking.id,
        title: finalTitle,
        description: description.trim() || undefined,
        kind,
        level,
        capacity: places,
        joinMode,
        costSplit,
      }),
    onSuccess: (game) => {
      qc.invalidateQueries({ queryKey: ['myReservations'] });
      qc.invalidateQueries({ queryKey: ['groupSessions'] });
      qc.invalidateQueries({ queryKey: ['myGroupSessions'] });
      setOpened(game);
    },
    onError: (e) => toast(errorMessage(e, te, tt('error')), 'error'),
  });

  if (opened) {
    return (
      <Modal open onClose={onClose} title={t('openedTitle')}>
        <p style={{ color: 'var(--ink-2)' }}>{joinMode === 'APPROVAL' ? t('openedBodyApproval') : t('openedBody')}</p>
        {/* Being told when someone signs up is the point: offer it right here. */}
        <div style={{ marginTop: 14 }}>
          <PushNotificationToggle nudge="game" />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          <Link href={`/sessions#gs-${opened.id}`} className="acct-btn is-primary" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
            {t('seeGame')}
          </Link>
          <button type="button" className="acct-btn" onClick={onClose}>
            {tg('close')}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={t('openTitle')}>
      <div style={{ display: 'grid', gap: 16 }}>
        <p className="og-booking mono">{booking.summary}</p>

        <ChoiceCards
          label={t('kindLabel')}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'SPARRING', title: t('kind.SPARRING'), help: t('kindHelp.SPARRING') },
            { value: 'TRAINING', title: t('kind.TRAINING'), help: t('kindHelp.TRAINING') },
          ]}
        />

        <div className="acct-grid2" style={{ marginTop: 0 }}>
          <label className="acct-field">
            {t('titleLabel')}
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t(`kind.${kind}`)} maxLength={160} className="acct-input" />
          </label>
          <label className="acct-field">
            {t('places')}
            <input
              type="number"
              min={1}
              max={30}
              value={Number.isNaN(places) ? '' : places}
              onChange={(e) => setPlaces(e.target.valueAsNumber)}
              className="acct-input"
              aria-invalid={!validPlaces}
            />
            <span className="acct-help">{t('placesHelp')}</span>
          </label>
        </div>

        <LevelPicker value={level} onChange={setLevel} />

        <ChoiceCards
          label={t('joinLabel')}
          value={joinMode}
          onChange={setJoinMode}
          options={[
            { value: 'OPEN', title: t('join.OPEN'), help: t('joinHelp.OPEN') },
            { value: 'APPROVAL', title: t('join.APPROVAL'), help: t('joinHelp.APPROVAL') },
          ]}
        />

        <ChoiceCards
          label={t('costLabel')}
          value={costSplit}
          onChange={setCostSplit}
          options={[
            {
              value: 'SHARED',
              title: t('cost.SHARED'),
              help: validPlaces ? t('costHelp.SHARED', { price: money(share), n: places + 1 }) : t('costHelp.SHAREDplain'),
            },
            { value: 'ORGANIZER', title: t('cost.ORGANIZER'), help: t('costHelp.ORGANIZER', { price: money(booking.priceCents) }) },
          ]}
        />
        <p className="acct-help" style={{ marginTop: -8 }}>
          {t('moneyNote')}
        </p>

        <label className="acct-field">
          {t('descriptionLabel')}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder={t('descriptionHint')}
            className="acct-input"
            style={{ minHeight: 64, padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }}
          />
        </label>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="acct-btn is-primary" disabled={!validPlaces || create.isPending} onClick={() => create.mutate()}>
            <BusyLabel busy={create.isPending}>{t('openSubmit')}</BusyLabel>
          </button>
          <button type="button" className="acct-btn" onClick={onClose}>
            {tg('close')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
