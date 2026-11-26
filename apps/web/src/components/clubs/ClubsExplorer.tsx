'use client';

/* eslint-disable @next/next/no-img-element -- club logos live on each club's own host; see ClubThumb */
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';
import type { ClubPublic } from '@/lib/api';
import { Link } from '@/i18n/navigation';
import { CourtMark } from '@/components/ClubThumb';
import { CloseIcon } from '@/components/CloseIcon';
import type { MapPin } from './ClubsMap';

// The map needs the browser (WebGL): it is drawn there only, the list on the server too.
const ClubsMap = dynamic(() => import('./ClubsMap').then((m) => m.ClubsMap), {
  ssr: false,
  loading: () => <div className="cmap cmap-loading" aria-hidden />,
});

/** Distance on the earth's surface, in kilometres. */
function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Lower case, no stress marks: "Цариградско" finds "цариградско". */
const fold = (s: string) => s.toLocaleLowerCase('bg').normalize('NFD').replace(/\p{M}/gu, '');

/** "Street 1, City" — without saying the city twice when the address already ends with it. */
const place = (c: ClubPublic) => (fold(c.address).includes(fold(c.city.name)) ? c.address : `${c.address}, ${c.city.name}`);

const hasPin = (c: ClubPublic): c is ClubPublic & { lat: number; lng: number } => c.lat != null && c.lng != null;

type Locate = 'idle' | 'asking' | 'denied' | 'unavailable';

/**
 * The clubs on a map and in a list, side by side (stacked on a phone): search
 * by name or address, narrow to a city, or sort by distance from where you
 * are. Choosing a club — its pin, or "on the map" in its row — raises the pin
 * and lays the club's card over the bottom of the map.
 */
export function ClubsExplorer({ clubs }: { clubs: ClubPublic[] }) {
  const t = useTranslations('Clubs');
  const locale = useLocale();
  const [query, setQuery] = useState('');
  // Opens on the city with the most clubs (where most people look), so the map
  // starts zoomed in on streets rather than on half the country.
  const [cityId, setCityId] = useState<number | null>(() => {
    const n = new Map<number, number>();
    for (const c of clubs) n.set(c.city.id, (n.get(c.city.id) ?? 0) + 1);
    return n.size > 1 ? [...n.entries()].sort((a, b) => b[1] - a[1])[0]![0] : null;
  });
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [locate, setLocate] = useState<Locate>('idle');
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const mapBox = useRef<HTMLDivElement>(null);

  const cities = useMemo(() => {
    const byId = new Map<number, { id: number; name: string; n: number }>();
    for (const c of clubs) {
      const e = byId.get(c.city.id) ?? { id: c.city.id, name: c.city.name, n: 0 };
      e.n++;
      byId.set(c.city.id, e);
    }
    return [...byId.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'bg'));
  }, [clubs]);

  const shown = useMemo(() => {
    const q = fold(query.trim());
    const list = clubs
      .filter((c) => cityId == null || c.city.id === cityId)
      .filter((c) => !q || fold(`${c.name} ${c.address} ${c.city.name}`).includes(q))
      .map((c) => ({ club: c, distance: me && hasPin(c) ? km(me, c) : null }));
    // Nearest first once we know where you are; clubs without a pin go last.
    if (me) list.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    return list;
  }, [clubs, cityId, query, me]);

  const pins: MapPin[] = useMemo(
    () =>
      shown
        .map((x) => x.club)
        .filter(hasPin)
        .map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, name: c.name, logoUrl: c.photoUrl })),
    [shown],
  );
  // The chosen club, while it is still among the ones shown.
  const chosen = shown.find((x) => x.club.id === openId && hasPin(x.club)) ?? null;

  const showOnMap = (id: number) => {
    setOpenId(id);
    // On a phone the map is above the list: go up to it.
    const box = mapBox.current;
    if (box && box.getBoundingClientRect().top < 0) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const findMe = () => {
    if (!('geolocation' in navigator)) return setLocate('unavailable');
    setLocate('asking');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setCityId(null);
        setLocate('idle');
      },
      (err) => setLocate(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  };

  const distanceLabel = (d: number) => (d < 1 ? t('distanceM', { m: Math.round(d * 100) * 10 }) : t('distanceKm', { km: d.toFixed(d < 10 ? 1 : 0) }));
  const mapsSearch = (c: ClubPublic) =>
    // To the club's own pin when it has set one; otherwise by its address, which Google finds better than our guess.
    hasPin(c) && !c.pinApprox
      ? `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.name}, ${place(c)}`)}`;

  return (
    <div className="cexp">
      {/* search, city, near me */}
      <div className="cexp-bar">
        <label className="cexp-search">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
          />
        </label>
        <button
          type="button"
          className={`cexp-near${me ? ' is-on' : ''}`}
          onClick={me ? () => setMe(null) : findMe}
          disabled={locate === 'asking'}
          aria-pressed={!!me}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
            <circle cx="8" cy="8" r="3" />
            <path d="M8 1v2.5M8 12.5V15M1 8h2.5M12.5 8H15" />
          </svg>
          {locate === 'asking' ? t('locating') : me ? t('nearMeOn') : t('nearMe')}
        </button>
      </div>
      {cities.length > 1 && (
        <div className="cexp-cities" role="group" aria-label={t('city')}>
          <button type="button" className={`coach-chip${cityId == null ? ' is-on' : ''}`} aria-pressed={cityId == null} onClick={() => setCityId(null)}>
            {t('allCities')}
          </button>
          {cities.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`coach-chip${cityId === c.id ? ' is-on' : ''}`}
              aria-pressed={cityId === c.id}
              onClick={() => setCityId(c.id)}
            >
              {c.name} <span className="cexp-count">{c.n}</span>
            </button>
          ))}
        </div>
      )}
      {(locate === 'denied' || locate === 'unavailable') && (
        <p className="cexp-note" role="status">
          {locate === 'denied' ? t('locateDenied') : t('locateUnavailable')}
        </p>
      )}

      <div className="cexp-layout">
        {/* the map */}
        <div className="cexp-map" ref={mapBox}>
          <ClubsMap
            pins={pins}
            activeId={hoverId}
            openId={chosen ? chosen.club.id : null}
            onSelect={setOpenId}
            me={me}
            locating={locate === 'asking'}
            onLocate={me ? () => setMe(null) : findMe}
            locale={locale}
            note={shown.length > 0 && pins.length < shown.length ? t('notOnMap', { n: shown.length - pins.length }) : null}
            labels={{
              region: t('mapLabel'),
              zoomIn: t('zoomIn'),
              zoomOut: t('zoomOut'),
              fitAll: t('fitAll'),
              locate: me ? t('nearMeOn') : t('nearMe'),
              you: t('you'),
              unavailable: t('mapUnavailable'),
              gestureTouch: t('gestureTouch'),
              gestureCtrl: t('gestureCtrl'),
              gestureCmd: t('gestureCmd'),
            }}
          >
            {chosen && (
              <div className="cmap-card" key={chosen.club.id}>
                <Link href={`/clubs/${chosen.club.slug}`} className="cmap-card-thumb" tabIndex={-1} aria-hidden>
                  {chosen.club.photoUrl ? <img src={chosen.club.photoUrl} alt="" /> : <CourtMark />}
                </Link>
                <div className="cmap-card-info">
                  <Link href={`/clubs/${chosen.club.slug}`} className="cmap-card-name">
                    {chosen.club.name}
                  </Link>
                  <span className="cmap-card-addr">
                    {chosen.distance != null && <b>{distanceLabel(chosen.distance)} · </b>}
                    {chosen.club.address}
                  </span>
                  <span className="cmap-card-actions">
                    <Link href={`/clubs/${chosen.club.slug}`} className="cmap-card-go">
                      {t('viewClub')} →
                    </Link>
                    <a className="cmap-card-dir" href={mapsSearch(chosen.club)} target="_blank" rel="noopener">
                      {t('directions')} ↗
                    </a>
                  </span>
                </div>
                <button type="button" className="cmap-card-close" onClick={() => setOpenId(null)} aria-label={t('closeCard')}>
                  <CloseIcon />
                </button>
              </div>
            )}
          </ClubsMap>
        </div>

        {/* the list */}
        <div className="cexp-list">
          <p className="cexp-total">{t('found', { count: shown.length })}</p>
          {shown.length === 0 && <div className="cexp-empty">{t('noMatch')}</div>}
          {shown.map(({ club: c, distance }) => (
            <article
              key={c.id}
              id={`club-${c.id}`}
              className={`cexp-card${chosen?.club.id === c.id ? ' is-on' : ''}`}
              onMouseEnter={() => setHoverId(c.id)}
              onMouseLeave={() => setHoverId((h) => (h === c.id ? null : h))}
            >
              <Link href={`/clubs/${c.slug}`} className="cexp-thumb" tabIndex={-1} aria-hidden>
                {c.photoUrl ? <img src={c.photoUrl} alt="" loading="lazy" /> : <CourtMark />}
              </Link>
              <div className="cexp-info">
                <Link href={`/clubs/${c.slug}`} className="cexp-name">
                  {c.name}
                </Link>
                <span className="cexp-addr">{place(c)}</span>
                <span className="cexp-meta">
                  {distance != null && <b>{distanceLabel(distance)}</b>}
                  {hasPin(c) ? (
                    <button type="button" className="cexp-link" onClick={() => showOnMap(c.id)}>
                      {t('showOnMap')}
                    </button>
                  ) : (
                    <span className="cexp-nopin">{t('noPin')}</span>
                  )}
                  <a className="cexp-link" href={mapsSearch(c)} target="_blank" rel="noopener">
                    {t('directions')} ↗
                  </a>
                </span>
              </div>
              <Link href={`/clubs/${c.slug}`} className="cexp-go">
                {t('viewClub')} →
              </Link>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
