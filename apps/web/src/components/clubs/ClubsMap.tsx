'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { LatLngBoundsExpression, Map as LeafletMap, Marker } from 'leaflet';

export interface MapPin {
  id: number;
  lat: number;
  lng: number;
  /** Shown in the popup. */
  name: string;
  address: string;
  href: string;
}

/** Sofia: where the map opens when there is nothing to fit it to. */
const DEFAULT_CENTER: [number, number] = [42.6977, 23.3219];

const pinHtml = (active: boolean) =>
  `<span class="cmap-pin${active ? ' is-active' : ''}"><svg viewBox="0 0 24 32" width="30" height="40" aria-hidden="true"><path d="M12 31s10-10.2 10-18A10 10 0 0 0 2 13c0 7.8 10 18 10 18z"/><circle cx="12" cy="12.5" r="4"/></svg></span>`;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * The clubs on an OpenStreetMap map, one pin each. Leaflet is loaded in the
 * browser only (it needs `window`). The map fits itself to the pins it is
 * given; the active pin is raised and coloured, and tapping a pin reports it
 * back so the list can follow.
 */
export function ClubsMap({
  pins,
  activeId,
  openId,
  onSelect,
  me,
  labels,
}: {
  pins: MapPin[];
  /** Highlighted (e.g. the card under the pointer). */
  activeId: number | null;
  /** Its popup open and brought into view (e.g. the card that was tapped). */
  openId: number | null;
  onSelect: (id: number) => void;
  /** The visitor's position, once they share it. */
  me: { lat: number; lng: number } | null;
  labels: { open: string; directions: string; you: string; region: string };
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const L = useRef<typeof import('leaflet') | null>(null);
  const markers = useRef(new Map<number, Marker>());
  const meMarker = useRef<Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    const placed = markers.current;
    void import('leaflet').then((mod) => {
      if (cancelled || !el.current || map.current) return;
      L.current = mod;
      const m = mod.map(el.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
      mod
        .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
        })
        .addTo(m);
      m.setView(DEFAULT_CENTER, 12);
      // Wheel zoom only once the map has been clicked, so the page still scrolls past it.
      m.on('click', () => m.scrollWheelZoom.enable());
      m.on('mouseout', () => m.scrollWheelZoom.disable());
      map.current = m;
      // Draw what is already known.
      syncPins();
      syncMe();
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      placed.clear();
      meMarker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; the effects below keep it in step
  }, []);

  /** Put the pins on the map (adding, moving and removing as the list changes) and fit the view. */
  function syncPins() {
    const m = map.current;
    const lf = L.current;
    if (!m || !lf) return;
    const seen = new Set<number>();
    for (const p of pins) {
      seen.add(p.id);
      let mk = markers.current.get(p.id);
      const popup = `<div class="cmap-pop"><b>${escapeHtml(p.name)}</b><span>${escapeHtml(p.address)}</span><span class="cmap-pop-links"><a href="${p.href}">${escapeHtml(labels.open)} →</a><a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" rel="noopener">${escapeHtml(labels.directions)}</a></span></div>`;
      if (!mk) {
        mk = lf
          .marker([p.lat, p.lng], {
            icon: lf.divIcon({ className: 'cmap-icon', html: pinHtml(false), iconSize: [30, 40], iconAnchor: [15, 39], popupAnchor: [0, -36] }),
            title: p.name,
            keyboard: true,
          })
          .addTo(m)
          .bindPopup(popup, { closeButton: false, offset: [0, 0] });
        mk.on('click', () => onSelectRef.current(p.id));
        markers.current.set(p.id, mk);
      } else {
        mk.setLatLng([p.lat, p.lng]);
        mk.setPopupContent(popup);
      }
    }
    for (const [id, mk] of markers.current) {
      if (!seen.has(id)) {
        mk.remove();
        markers.current.delete(id);
      }
    }
    const points: [number, number][] = pins.map((p) => [p.lat, p.lng]);
    if (me) points.push([me.lat, me.lng]);
    if (points.length === 1) m.setView(points[0]!, 14);
    else if (points.length > 1) m.fitBounds(points as LatLngBoundsExpression, { padding: [40, 40], maxZoom: 14 });
  }

  function syncMe() {
    const m = map.current;
    const lf = L.current;
    if (!m || !lf) return;
    if (!me) {
      meMarker.current?.remove();
      meMarker.current = null;
      return;
    }
    if (!meMarker.current) {
      meMarker.current = lf
        .marker([me.lat, me.lng], {
          icon: lf.divIcon({ className: 'cmap-icon', html: '<span class="cmap-me"></span>', iconSize: [20, 20], iconAnchor: [10, 10] }),
          title: labels.you,
          zIndexOffset: -100,
        })
        .addTo(m);
    } else {
      meMarker.current.setLatLng([me.lat, me.lng]);
    }
  }

  // Keep the pins in step with the list.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- syncPins reads the latest props
  useEffect(() => syncPins(), [pins, me]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- syncMe reads the latest props
  useEffect(() => syncMe(), [me]);

  // Raise and colour the highlighted pin.
  useEffect(() => {
    const lf = L.current;
    if (!lf) return;
    for (const [id, mk] of markers.current) {
      const on = id === activeId || id === openId;
      mk.setIcon(lf.divIcon({ className: 'cmap-icon', html: pinHtml(on), iconSize: [30, 40], iconAnchor: [15, 39], popupAnchor: [0, -36] }));
      mk.setZIndexOffset(on ? 1000 : 0);
    }
  }, [activeId, openId, pins]);

  // Open the chosen club's popup and bring it into view.
  useEffect(() => {
    if (openId == null) return;
    const mk = markers.current.get(openId);
    const m = map.current;
    if (!mk || !m) return;
    if (!m.getBounds().pad(-0.15).contains(mk.getLatLng())) m.panTo(mk.getLatLng());
    mk.openPopup();
  }, [openId]);

  return <div ref={el} className="cmap" role="region" aria-label={labels.region} />;
}
