'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import type { ClubPublic } from '@/lib/api';
import { adminUpdateClubProfile } from '@/lib/api';
import { parseLatLng, roundCoord, type LatLng } from '@/lib/latlng';
import { MAP_ATTRIBUTION } from '@/lib/mapStyle';
import { SOFIA, createBaseMap, type MapLibre } from '@/components/clubs/mapCore';
import { BusyLabel } from '@/components/Spinner';
import { useToast } from '../Toast';

/** The picker's pin: a drop with its point on the spot, so it can be set to a doorway. */
const PIN = `<svg viewBox="0 0 24 32" width="34" height="45" aria-hidden="true"><path d="M12 31s10-10.2 10-18A10 10 0 0 0 2 13c0 7.8 10 18 10 18z" fill="#123b2c" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="12.5" r="4.2" fill="#cfea6e"/></svg>`;

const same = (a: LatLng | null, b: LatLng | null) => a?.lat === b?.lat && a?.lng === b?.lng;

/**
 * Where the club is — its own card in the club's settings, saved on its own.
 * The spot set here is the club's pin on the clubs map and where "Directions"
 * leads, so it should be the entrance. Three ways to set it: click the map (or
 * drag the pin), paste coordinates or a Google Maps link, or start from the
 * address and correct the guess.
 */
export function ClubLocationEditor({ clubId, club }: { clubId: number; club: ClubPublic }) {
  const t = useTranslations('ClubAdmin');
  const tm = useTranslations('Clubs');
  const locale = useLocale();
  const qc = useQueryClient();
  const toast = useToast();

  const initial: LatLng | null = club.lat != null && club.lng != null ? { lat: club.lat, lng: club.lng } : null;
  const [saved, setSaved] = useState<LatLng | null>(initial);
  const [pos, setPos] = useState<LatLng | null>(initial);
  const [pasted, setPasted] = useState('');
  const [finding, setFinding] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [failed, setFailed] = useState(false);

  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const ml = useRef<MapLibre | null>(null);
  const address = club.address.toLocaleLowerCase('bg').includes(club.city.name.toLocaleLowerCase('bg'))
    ? club.address
    : `${club.address}, ${club.city.name}`;

  /** Put the pin at `p` (creating it the first time), or take it off the map. */
  const show = (p: LatLng | null, fly = false) => {
    const m = map.current;
    const lib = ml.current;
    if (!m || !lib) return;
    if (!p) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    const at: [number, number] = [p.lng, p.lat];
    if (!marker.current) {
      const pin = document.createElement('div');
      pin.className = 'clp-pin';
      pin.innerHTML = PIN;
      const mk = new lib.Marker({ element: pin, anchor: 'bottom', draggable: true }).setLngLat(at).addTo(m);
      mk.on('dragend', () => {
        const d = mk.getLngLat();
        setPos({ lat: roundCoord(d.lat), lng: roundCoord(d.lng) });
        setNote(null);
      });
      marker.current = mk;
    } else {
      marker.current.setLngLat(at);
    }
    if (fly) m.easeTo({ center: at, zoom: Math.max(m.getZoom(), 16.5), duration: 600 });
  };

  /** Move the pin and remember the new spot (not saved until the button is pressed). */
  const move = (p: LatLng | null, fly = false) => {
    setPos(p);
    show(p, fly);
  };

  useEffect(() => {
    let cancelled = false;
    const host = el.current;
    if (!host) return;
    createBaseMap(host, {
      locale,
      center: initial ? [initial.lng, initial.lat] : SOFIA,
      zoom: initial ? 16.5 : 11.5,
      // A tool, not a page to scroll past: the wheel zooms straight away.
      wheel: true,
      gestureHelp: { touch: tm('gestureTouch'), ctrl: tm('gestureCtrl'), cmd: tm('gestureCmd') },
    })
      .then(({ map: m, ml: lib }) => {
        if (cancelled) return m.remove();
        map.current = m;
        ml.current = lib;
        m.on('click', (e) => {
          move({ lat: roundCoord(e.lngLat.lat), lng: roundCoord(e.lngLat.lng) });
          setNote(null);
        });
        show(initial);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once with the saved position
  }, []);

  const findFromAddress = async () => {
    setFinding(true);
    setNote(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=bg&accept-language=bg&q=${encodeURIComponent(address)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const hit = ((await res.json()) as { lat: string; lon: string }[])[0];
      if (!hit) return setNote({ text: t('locationNotFound'), error: true });
      move({ lat: roundCoord(Number(hit.lat)), lng: roundCoord(Number(hit.lon)) }, true);
      setNote({ text: t('locationCheck') });
    } catch {
      setNote({ text: t('locationNotFound'), error: true });
    } finally {
      setFinding(false);
    }
  };

  const applyPasted = () => {
    const p = parseLatLng(pasted);
    if (!p) return setNote({ text: t('locationPasteBad'), error: true });
    move(p, true);
    setPasted('');
    setNote({ text: t('locationPasteOk') });
  };

  const save = useMutation({
    mutationFn: (p: LatLng | null) => adminUpdateClubProfile(clubId, { lat: p?.lat ?? null, lng: p?.lng ?? null }),
    onSuccess: (_club, p) => {
      setSaved(p);
      setNote(null);
      qc.invalidateQueries({ queryKey: ['myClubs'] });
      qc.invalidateQueries({ queryKey: ['platformClub', clubId] });
      toast(p ? t('locationSaved') : t('locationRemoved'));
    },
    onError: (e) => toast(e instanceof Error ? e.message : t('locationSaveFailed'), 'error'),
  });

  const dirty = !same(pos, saved);
  const zoomBy = (d: number) => map.current?.easeTo({ zoom: map.current.getZoom() + d, duration: 250 });

  return (
    <section className="clp">
      <div className="clp-head">
        <div>
          <h2 className="clp-title">{t('location')}</h2>
          <p className="clp-intro">{t('locationIntro')}</p>
        </div>
        <span className={`clp-state${pos ? ' is-set' : ''}`}>
          {pos ? `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}` : t('locationMissing')}
        </span>
      </div>

      <div className="clp-tools">
        <form
          className="clp-paste"
          onSubmit={(e) => {
            e.preventDefault();
            applyPasted();
          }}
        >
          <input
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={t('locationPaste')}
            aria-label={t('locationPaste')}
            inputMode="text"
            autoComplete="off"
          />
          <button type="submit" className="acct-btn" disabled={!pasted.trim()}>
            {t('locationPasteGo')}
          </button>
        </form>
        <button type="button" className="acct-btn" onClick={findFromAddress} disabled={finding || !club.address.trim()}>
          {finding ? t('locationFinding') : t('locationFind')}
        </button>
      </div>

      <div className="clp-frame">
        <div ref={el} className="clp-map" />
        {failed ? (
          <p className="cmap-failed">{tm('mapUnavailable')}</p>
        ) : (
          <>
            <div className="cmap-ctrl">
              <div className="cmap-zoom">
                <button type="button" onClick={() => zoomBy(1)} aria-label={tm('zoomIn')} title={tm('zoomIn')}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                    <path d="M8 3v10M3 8h10" />
                  </svg>
                </button>
                <button type="button" onClick={() => zoomBy(-1)} aria-label={tm('zoomOut')} title={tm('zoomOut')}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                    <path d="M3 8h10" />
                  </svg>
                </button>
              </div>
            </div>
            <p className="cmap-credit">
              {MAP_ATTRIBUTION.map((a, i) => (
                <span key={a.href}>
                  {i > 0 && ' · '}
                  <a href={a.href} target="_blank" rel="noopener">
                    {a.label}
                  </a>
                </span>
              ))}
            </p>
          </>
        )}
      </div>

      <p className={`acct-help${note?.error ? ' is-error' : ''}`} role="status">
        {note?.text ?? (dirty ? t('locationUnsaved') : t('locationHelp'))}
      </p>

      <div className="clp-actions">
        <button type="button" className="acct-btn is-primary" onClick={() => save.mutate(pos)} disabled={!dirty || save.isPending}>
          <BusyLabel busy={save.isPending}>{t('locationSave')}</BusyLabel>
        </button>
        {pos && (
          <a
            className="clp-verify"
            href={`https://www.google.com/maps/search/?api=1&query=${pos.lat}%2C${pos.lng}`}
            target="_blank"
            rel="noopener"
          >
            {t('locationVerify')} ↗
          </a>
        )}
        {pos && (
          <button
            type="button"
            className="acct-btn is-quiet"
            onClick={() => {
              move(null);
              setNote(null);
            }}
          >
            {t('locationClear')}
          </button>
        )}
      </div>
    </section>
  );
}
