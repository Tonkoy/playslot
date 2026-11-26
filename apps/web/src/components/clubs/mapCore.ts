import type { Map as MapLibreMap } from 'maplibre-gl';
import { loadMapStyle } from '@/lib/mapStyle';

export type MapLibre = typeof import('maplibre-gl');

/** Sofia: where a map opens when it has nothing to show yet. [lng, lat] */
export const SOFIA: [number, number] = [23.3219, 42.6977];

/**
 * A PlaySlot map in `el`: our own style, north always up, no stock controls
 * (the components draw their own). On a touch screen the page keeps the
 * one-finger scroll and the map takes two fingers; with a mouse the wheel
 * zooms only after the map has been clicked, so the page scrolls past it.
 *
 * Throws when the browser cannot draw it (no WebGL): callers show a fallback.
 */
export async function createBaseMap(
  el: HTMLElement,
  opts: {
    locale: string;
    center: [number, number];
    zoom: number;
    /** Let the mouse wheel zoom at once (a tool, like the location picker) instead of only after a click. */
    wheel?: boolean;
    gestureHelp: { touch: string; ctrl: string; cmd: string };
  },
): Promise<{ map: MapLibreMap; ml: MapLibre }> {
  const [mod, style] = await Promise.all([import('maplibre-gl'), loadMapStyle(opts.locale)]);
  // The package is one CommonJS bundle: bundlers hand it over as `default`.
  const ml = ((mod as unknown as { default?: MapLibre }).default ?? mod) as MapLibre;
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const map = new ml.Map({
    container: el,
    style,
    center: opts.center,
    zoom: opts.zoom,
    minZoom: 5,
    maxZoom: 18,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    cooperativeGestures: touch,
    locale: {
      'CooperativeGesturesHandler.MobileHelpText': opts.gestureHelp.touch,
      'CooperativeGesturesHandler.WindowsHelpText': opts.gestureHelp.ctrl,
      'CooperativeGesturesHandler.MacHelpText': opts.gestureHelp.cmd,
    },
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  if (!touch && !opts.wheel) {
    map.scrollZoom.disable();
    map.on('click', () => map.scrollZoom.enable());
    el.addEventListener('mouseleave', () => map.scrollZoom.disable());
  }
  return { map, ml };
}

/** The ball that stands in for a club without a logo. */
export const BALL_SVG =
  '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#cfea6e"/><path d="M2.5 5.5c4.2 3 4.2 10 0 13M21.5 5.5c-4.2 3-4.2 10 0 13" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/></svg>';
