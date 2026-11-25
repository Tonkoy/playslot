'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

/** 20261128T160000Z — the form Google Calendar's template link expects. */
const gcalTime = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * "Добави в календара" for one booking, on any phone:
 *  - Apple / Outlook / Samsung: the booking's .ics file from the API — iPhone
 *    Safari opens it straight into Calendar, other calendar apps import it;
 *  - Google Calendar: its "new event" page, prefilled — on Android it opens in
 *    the Calendar app.
 */
export function AddToCalendar({
  reservationId,
  title,
  location,
  startsAt,
  endsAt,
  compact = false,
}: {
  reservationId: number;
  title: string;
  location?: string | null;
  startsAt: string;
  endsAt: string;
  /** Icon + short label, for tight rows. */
  compact?: boolean;
}) {
  const t = useTranslations('AddToCalendar');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const google = new URL('https://calendar.google.com/calendar/render');
  google.searchParams.set('action', 'TEMPLATE');
  google.searchParams.set('text', title);
  google.searchParams.set('dates', `${gcalTime(startsAt)}/${gcalTime(endsAt)}`);
  if (location) google.searchParams.set('location', location);
  google.searchParams.set('details', `${t('bookingNo')} ${reservationId}`);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="atc-btn"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <rect x="2" y="3" width="12" height="11" rx="2" />
          <path d="M2 6.5h12M5 1.5v3M11 1.5v3M8 8.5v3.5M6.25 10.25h3.5" strokeLinecap="round" />
        </svg>
        {compact ? t('short') : t('add')}
      </button>
      <div role="menu" className={`atc-menu${open ? ' is-open' : ''}`} inert={!open}>
        <a role="menuitem" href={`/api/reservations/${reservationId}/calendar.ics`} onClick={() => setOpen(false)}>
          <span aria-hidden>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="2" y="3" width="12" height="11" rx="2" />
              <path d="M2 6.5h12M5 1.5v3M11 1.5v3" strokeLinecap="round" />
            </svg>
          </span>
          <span>
            {t('apple')}
            <small>{t('appleHint')}</small>
          </span>
        </a>
        <a role="menuitem" href={google.toString()} target="_blank" rel="noopener" onClick={() => setOpen(false)}>
          <span aria-hidden className="atc-g">G</span>
          <span>
            {t('google')}
            <small>{t('googleHint')}</small>
          </span>
        </a>
      </div>
    </div>
  );
}
