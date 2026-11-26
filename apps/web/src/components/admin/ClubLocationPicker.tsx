'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { MAP_ATTRIBUTION } from '@/lib/mapStyle';
import { SOFIA, createBaseMap, type MapLibre } from '@/components/clubs/mapCore';

/** The picker's pin: a drop with its point on the spot, so it can be set to a doorway. */
const PIN = `<svg viewBox="0 0 24 32" width="34" height="45" aria-hidden="true"><path d="M12 31s10-10.2 10-18A10 10 0 0 0 2 13c0 7.8 10 18 10 18z" fill="#123b2c" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="12.5" r="4.2" fill="#cfea6e"/></svg>`;

/**
 * Where the club is, for the map on the clubs page. "Find from the address"
 * asks OpenStreetMap's geocoder for a first guess; the admin then corrects it
 * by clicking the map or dragging the pin to the club's real entrance.
 */
export function ClubLocationPicker({
  lat,
  lng,
  address,
  onChange,
}: {
  lat: number | null;
  lng: number | null;
  /** Full address to look up ("street, city"). */
  address: string;
  onChange: (pos: { lat: number; lng: number } | null) => void;
}) {
  const t = useTranslations('ClubAdmin');
  const tm = useTranslations('Clubs');
  const locale = useLocale();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const ml = useRef<MapLibre | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [finding, setFinding] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  /** Put the pin at [lat, lng], creating it the first time. */
  const place = (pos: [number, number], fly = false) => {
    const m = map.current;
    const lib = ml.current;
    if (!m || !lib) return;
    const at: [number, number] = [pos[1], pos[0]];
    if (!marker.current) {
      const pin = document.createElement('div');
      pin.className = 'clp-pin';
      pin.innerHTML = PIN;
      marker.current = new lib.Marker({ element: pin, anchor: 'bottom', draggable: true }).setLngLat(at).addTo(m);
      marker.current.on('dragend', () => {
        const p = marker.current!.getLngLat();
        onChangeRef.current({ lat: round(p.lat), lng: round(p.lng) });
      });
    } else {
      marker.current.setLngLat(at);
    }
    if (fly) m.easeTo({ center: at, zoom: 16.5, duration: 600 });
  };

  useEffect(() => {
    let cancelled = false;
    const host = el.current;
    if (!host) return;
    const saved = lat != null && lng != null;
    createBaseMap(host, {
      locale,
      center: saved ? [lng, lat] : SOFIA,
      zoom: saved ? 16 : 11.5,
      gestureHelp: { touch: tm('gestureTouch'), ctrl: tm('gestureCtrl'), cmd: tm('gestureCmd') },
    })
      .then(({ map: m, ml: lib }) => {
        if (cancelled) return m.remove();
        map.current = m;
        ml.current = lib;
        m.on('click', (e) => {
          place([e.lngLat.lat, e.lngLat.lng]);
          onChangeRef.current({ lat: round(e.lngLat.lat), lng: round(e.lngLat.lng) });
        });
        if (saved) place([lat, lng]);
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
      const hits = (await res.json()) as { lat: string; lon: string }[];
      const hit = hits[0];
      if (!hit) {
        setNote(t('locationNotFound'));
        return;
      }
      const pos: [number, number] = [round(Number(hit.lat)), round(Number(hit.lon))];
      place(pos, true);
      onChange({ lat: pos[0], lng: pos[1] });
      setNote(t('locationCheck'));
    } catch {
      setNote(t('locationNotFound'));
    } finally {
      setFinding(false);
    }
  };

  return (
    <div className="clp">
      <div className="clp-head">
        <span>
          <span className="acct-field">{t('location')}</span>
          <span className="acct-help" style={{ display: 'block', marginTop: 2 }}>
            {lat != null && lng != null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : t('locationNone')}
          </span>
        </span>
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="acct-btn" onClick={findFromAddress} disabled={finding || !address.trim()}>
            {finding ? t('locationFinding') : t('locationFind')}
          </button>
          {lat != null && (
            <button
              type="button"
              className="acct-btn is-quiet"
              onClick={() => {
                marker.current?.remove();
                marker.current = null;
                onChange(null);
              }}
            >
              {t('locationClear')}
            </button>
          )}
        </span>
      </div>
      <div className="clp-frame">
        <div ref={el} className="clp-map" />
        {failed ? (
          <p className="cmap-failed">{tm('mapUnavailable')}</p>
        ) : (
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
        )}
      </div>
      <p className="acct-help">{note ?? t('locationHelp')}</p>
    </div>
  );
}

/** Five decimals is about a metre: plenty for an entrance, and tidy to store. */
const round = (v: number) => Math.round(v * 1e5) / 1e5;
