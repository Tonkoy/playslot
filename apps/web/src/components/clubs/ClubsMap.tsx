'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { MAP_ATTRIBUTION } from '@/lib/mapStyle';
import { BALL_SVG, SOFIA, createBaseMap, type MapLibre } from './mapCore';

export interface MapPin {
  id: number;
  lat: number;
  lng: number;
  name: string;
  /** The club's logo, shown in the pin. */
  logoUrl: string | null;
}

export interface MapLabels {
  region: string;
  zoomIn: string;
  zoomOut: string;
  fitAll: string;
  locate: string;
  you: string;
  unavailable: string;
  gestureTouch: string;
  gestureCtrl: string;
  gestureCmd: string;
}

/** How many of the nearest clubs "near me" brings into view. */
const NEAREST = 3;
/** Below this zoom the pins fold to their logo, so a whole city of them stays readable. */
const FAR_ZOOM = 11.2;

/** A club's pin: its logo and its name on a pill, with a stem down to the spot. */
function pinElement(p: MapPin, onPick: () => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'cmap-mk';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cmap-pin';
  btn.setAttribute('aria-label', p.name);
  const logo = document.createElement('span');
  logo.className = 'cmap-pin-logo';
  if (p.logoUrl) {
    const img = document.createElement('img');
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => {
      logo.innerHTML = BALL_SVG;
    };
    img.src = p.logoUrl;
    logo.appendChild(img);
  } else {
    logo.innerHTML = BALL_SVG;
  }
  const name = document.createElement('span');
  name.className = 'cmap-pin-name';
  name.textContent = p.name;
  btn.append(logo, name);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onPick();
  });
  wrap.appendChild(btn);
  return wrap;
}

/**
 * The clubs on PlaySlot's own map (see lib/mapStyle), one named pin each.
 * MapLibre is loaded in the browser only. The map fits itself to the pins it
 * is given; the chosen pin is raised and filled, and picking a pin (or the
 * empty map, to let go of it) is reported back so the list can follow.
 * `children` is laid over the bottom of the map: the chosen club's card.
 */
export function ClubsMap({
  pins,
  activeId,
  openId,
  onSelect,
  me,
  locating,
  onLocate,
  locale,
  labels,
  note,
  children,
}: {
  pins: MapPin[];
  /** Highlighted (e.g. the card under the pointer). */
  activeId: number | null;
  /** Chosen: filled, raised and brought into view. */
  openId: number | null;
  onSelect: (id: number | null) => void;
  /** The visitor's position, once they share it. */
  me: { lat: number; lng: number } | null;
  locating: boolean;
  onLocate: () => void;
  locale: string;
  labels: MapLabels;
  /** A short remark shown in the map's corner (e.g. clubs that have no pin yet). */
  note?: string | null;
  children?: ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const ml = useRef<MapLibre | null>(null);
  const markers = useRef(new Map<number, Marker>());
  const meMarker = useRef<Marker | null>(null);
  const fitted = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  /**
   * Bring the clubs into view: all of them, or — once the visitor has shared
   * where they are — themselves and the few nearest (the pins come nearest
   * first then), which is what "near me" is asking for. `all` shows everything.
   */
  function fit(animate: boolean, all = false) {
    const m = map.current;
    const lib = ml.current;
    if (!m || !lib) return;
    const points: [number, number][] = (me && !all ? pins.slice(0, NEAREST) : pins).map((p) => [p.lng, p.lat]);
    if (me) points.push([me.lng, me.lat]);
    const duration = animate ? 600 : 0;
    if (points.length === 0) m.easeTo({ center: SOFIA, zoom: 11, duration });
    else if (points.length === 1) m.easeTo({ center: points[0]!, zoom: 14, duration });
    else {
      const bounds = points.reduce((b, p) => b.extend(p), new lib.LngLatBounds(points[0]!, points[0]!));
      // The named pins are wide and tall: leave them room at the sides and under the corner note.
      const side = Math.min(110, Math.round(m.getContainer().clientWidth * 0.2));
      m.fitBounds(bounds, { padding: { top: 120, bottom: 60, left: side, right: side }, maxZoom: 14.5, duration });
    }
  }

  /** Put the pins on the map: adding, moving and removing as the list changes. */
  function syncPins() {
    const m = map.current;
    const lib = ml.current;
    if (!m || !lib) return;
    const seen = new Set<number>();
    for (const p of pins) {
      seen.add(p.id);
      const mk = markers.current.get(p.id);
      if (mk) mk.setLngLat([p.lng, p.lat]);
      else {
        const created = new lib.Marker({ element: pinElement(p, () => onSelectRef.current(p.id)), anchor: 'bottom' })
          .setLngLat([p.lng, p.lat])
          .addTo(m);
        markers.current.set(p.id, created);
      }
    }
    for (const [id, mk] of markers.current) {
      if (!seen.has(id)) {
        mk.remove();
        markers.current.delete(id);
      }
    }
  }

  function syncMe() {
    const m = map.current;
    const lib = ml.current;
    if (!m || !lib) return;
    if (!me) {
      meMarker.current?.remove();
      meMarker.current = null;
      return;
    }
    if (!meMarker.current) {
      const dot = document.createElement('div');
      dot.className = 'cmap-me';
      dot.title = labels.you;
      meMarker.current = new lib.Marker({ element: dot }).setLngLat([me.lng, me.lat]).addTo(m);
    } else {
      meMarker.current.setLngLat([me.lng, me.lat]);
    }
  }

  /** Fill and raise the highlighted pins. */
  function syncActive() {
    for (const [id, mk] of markers.current) {
      const node = mk.getElement();
      node.classList.toggle('is-on', id === openId);
      node.classList.toggle('is-hover', id === activeId && id !== openId);
      node.style.zIndex = id === openId ? '3' : id === activeId ? '2' : '1';
    }
  }

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    const placed = markers.current;
    const host = el.current;
    if (!host) return;
    createBaseMap(host, {
      locale,
      center: SOFIA,
      zoom: 11,
      gestureHelp: { touch: labels.gestureTouch, ctrl: labels.gestureCtrl, cmd: labels.gestureCmd },
    })
      .then(({ map: m, ml: lib }) => {
        if (cancelled) return m.remove();
        map.current = m;
        ml.current = lib;
        const far = () => frame.current?.classList.toggle('is-far', m.getZoom() < FAR_ZOOM);
        m.on('zoom', far);
        // A click on the map itself lets go of the chosen club.
        m.on('click', () => onSelectRef.current(null));
        // Shown as soon as it has drawn — or after a moment regardless, so that
        // slow or unreachable tiles never hide the pins.
        const ready = () => !cancelled && setState('ready');
        m.once('load', ready);
        m.once('error', ready);
        window.setTimeout(ready, 2500);
        syncPins();
        syncMe();
        syncActive();
        fit(false);
        fitted.current = true;
        far();
      })
      .catch(() => {
        if (!cancelled) setState('failed');
      });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      placed.clear();
      meMarker.current = null;
      fitted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; the effects below keep it in step
  }, []);

  // Keep the pins in step with the list, and the view on them.
  useEffect(() => {
    syncPins();
    syncMe();
    syncActive();
    if (fitted.current) fit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the sync functions read the latest props
  }, [pins, me]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- syncActive reads the latest props
  useEffect(() => syncActive(), [activeId, openId]);

  // Bring the chosen club into view, a little above centre: its card covers the bottom.
  useEffect(() => {
    if (openId == null) return;
    const mk = markers.current.get(openId);
    const m = map.current;
    if (!mk || !m) return;
    m.easeTo({ center: mk.getLngLat(), zoom: Math.max(m.getZoom(), 13.5), offset: [0, -50], duration: 500 });
  }, [openId]);

  const zoomBy = (d: number) => map.current?.easeTo({ zoom: map.current.getZoom() + d, duration: 250 });

  return (
    <div ref={frame} className={`cmap is-${state}`} role="region" aria-label={labels.region}>
      <div ref={el} className="cmap-canvas" />
      {state === 'failed' ? (
        <p className="cmap-failed">{labels.unavailable}</p>
      ) : (
        <>
          {note && <p className="cmap-note">{note}</p>}
          <div className="cmap-ctrl">
            <div className="cmap-zoom">
              <button type="button" onClick={() => zoomBy(1)} aria-label={labels.zoomIn} title={labels.zoomIn}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                  <path d="M8 3v10M3 8h10" />
                </svg>
              </button>
              <button type="button" onClick={() => zoomBy(-1)} aria-label={labels.zoomOut} title={labels.zoomOut}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                  <path d="M3 8h10" />
                </svg>
              </button>
            </div>
            <button
              type="button"
              className={`cmap-btn${me ? ' is-on' : ''}`}
              onClick={onLocate}
              disabled={locating}
              aria-pressed={!!me}
              aria-label={labels.locate}
              title={labels.locate}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                <circle cx="8" cy="8" r="3" />
                <path d="M8 1v2.5M8 12.5V15M1 8h2.5M12.5 8H15" />
              </svg>
            </button>
            {pins.length + (me ? 1 : 0) > 1 && (
              <button type="button" className="cmap-btn" onClick={() => fit(true, true)} aria-label={labels.fitAll} title={labels.fitAll}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
                </svg>
              </button>
            )}
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
          {children}
        </>
      )}
    </div>
  );
}
