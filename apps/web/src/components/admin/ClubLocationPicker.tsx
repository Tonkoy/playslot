'use client';

import 'leaflet/dist/leaflet.css';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';

const SOFIA: [number, number] = [42.6977, 23.3219];
const PIN = `<span class="cmap-pin is-active"><svg viewBox="0 0 24 32" width="30" height="40" aria-hidden="true"><path d="M12 31s10-10.2 10-18A10 10 0 0 0 2 13c0 7.8 10 18 10 18z"/><circle cx="12" cy="12.5" r="4"/></svg></span>`;

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
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const L = useRef<typeof import('leaflet') | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [finding, setFinding] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const place = (pos: [number, number], fly = false) => {
    const m = map.current;
    const lf = L.current;
    if (!m || !lf) return;
    if (!marker.current) {
      marker.current = lf
        .marker(pos, {
          draggable: true,
          icon: lf.divIcon({ className: 'cmap-icon', html: PIN, iconSize: [30, 40], iconAnchor: [15, 39] }),
        })
        .addTo(m);
      marker.current.on('dragend', () => {
        const p = marker.current!.getLatLng();
        onChangeRef.current({ lat: round(p.lat), lng: round(p.lng) });
      });
    } else {
      marker.current.setLatLng(pos);
    }
    if (fly) m.setView(pos, 17);
  };

  useEffect(() => {
    let cancelled = false;
    void import('leaflet').then((mod) => {
      if (cancelled || !el.current || map.current) return;
      L.current = mod;
      const start: [number, number] = lat != null && lng != null ? [lat, lng] : SOFIA;
      const m = mod.map(el.current, { scrollWheelZoom: false }).setView(start, lat != null ? 16 : 12);
      mod
        .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
        })
        .addTo(m);
      m.on('click', (e) => {
        place([e.latlng.lat, e.latlng.lng]);
        onChangeRef.current({ lat: round(e.latlng.lat), lng: round(e.latlng.lng) });
      });
      map.current = m;
      if (lat != null && lng != null) place([lat, lng]);
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
      <div ref={el} className="clp-map" />
      <p className="acct-help">{note ?? t('locationHelp')}</p>
    </div>
  );
}

/** Five decimals is about a metre: plenty for an entrance, and tidy to store. */
const round = (v: number) => Math.round(v * 1e5) / 1e5;
