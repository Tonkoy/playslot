import type { LayerSpecification, StyleSpecification, VectorSourceSpecification } from 'maplibre-gl';

/*
 * PlaySlot's own map: OpenStreetMap data (vector tiles from OpenFreeMap, in
 * the OpenMapTiles schema) drawn in the site's palette. The point of drawing
 * it ourselves is restraint: land, green, water, streets and a few names,
 * so that the clubs are the loudest thing on it. Sports grounds get the clay
 * tint, since courts are what people come here to find.
 */
const C = {
  land: '#eef1ea',
  urban: '#e7ece3',
  green: '#d6e9d3',
  wood: '#cbe3c8',
  water: '#c5e3e6',
  sport: '#f4d3c1',
  sportLine: '#e3a787',
  building: '#dde3da',
  buildingLine: '#cfd7cc',
  road: '#ffffff',
  roadCase: '#d3dbd0',
  highway: '#e6f1b4',
  highwayCase: '#c3d285',
  rail: '#cdd5cb',
  border: '#9fb0a3',
  ink: '#123b2c',
  inkSoft: '#56665c',
  inkFaint: '#839187',
  waterInk: '#4f8f97',
  halo: '#ffffff',
} as const;

const FONT = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];

/** Where OpenFreeMap serves from when its own style file cannot be asked. */
const FALLBACK_SOURCE: VectorSourceSpecification = { type: 'vector', url: 'https://tiles.openfreemap.org/planet' };
const FALLBACK_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const OFM_STYLE = 'https://tiles.openfreemap.org/styles/positron';

/** The credits the data and the tiles ask for; drawn by our own corner label, not MapLibre's. */
export const MAP_ATTRIBUTION = [
  { label: '© OpenStreetMap', href: 'https://www.openstreetmap.org/copyright' },
  { label: 'OpenMapTiles', href: 'https://www.openmaptiles.org/' },
  { label: 'OpenFreeMap', href: 'https://openfreemap.org' },
] as const;

type Expr = unknown[];

/** A width that grows with the zoom the way streets do (base 1.5), from [zoom, px] stops. */
const grow = (...stops: [number, number][]): Expr => ['interpolate', ['exponential', 1.5], ['zoom'], ...stops.flat()];

function layers(locale: string): LayerSpecification[] {
  // Bulgarian names as they are written locally; Latin ones for the English site.
  const name: Expr =
    locale === 'bg'
      ? ['coalesce', ['get', 'name:bg'], ['get', 'name']]
      : ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name:latin'], ['get', 'name']];
  const src = { source: 'osm' } as const;
  const road = (id: string, classes: string[], color: string, width: Expr, minzoom: number, extra: object = {}) =>
    ({
      id,
      type: 'line',
      ...src,
      'source-layer': 'transportation',
      minzoom,
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['in', ['get', 'class'], ['literal', classes]]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': color, 'line-width': width, ...extra },
    }) as unknown as LayerSpecification;

  const list: unknown[] = [
    { id: 'land', type: 'background', paint: { 'background-color': C.land } },
    {
      id: 'urban',
      type: 'fill',
      ...src,
      'source-layer': 'landuse',
      filter: ['in', ['get', 'class'], ['literal', ['residential', 'commercial', 'industrial', 'retail']]],
      paint: { 'fill-color': C.urban, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.9, 14, 0.4] },
    },
    {
      id: 'wood',
      type: 'fill',
      ...src,
      'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass']]],
      paint: { 'fill-color': ['match', ['get', 'class'], 'wood', C.wood, C.green], 'fill-opacity': 0.75 },
    },
    { id: 'park', type: 'fill', ...src, 'source-layer': 'park', paint: { 'fill-color': C.green, 'fill-opacity': 0.8 } },
    {
      id: 'green',
      type: 'fill',
      ...src,
      'source-layer': 'landuse',
      filter: ['in', ['get', 'class'], ['literal', ['cemetery', 'garden', 'playground', 'zoo']]],
      paint: { 'fill-color': C.green, 'fill-opacity': 0.7 },
    },
    { id: 'water', type: 'fill', ...src, 'source-layer': 'water', paint: { 'fill-color': C.water } },
    {
      id: 'river',
      type: 'line',
      ...src,
      'source-layer': 'waterway',
      minzoom: 10,
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': C.water, 'line-width': grow([10, 0.8], [16, 5]) },
    },
    {
      id: 'airfield',
      type: 'fill',
      ...src,
      'source-layer': 'aeroway',
      minzoom: 10,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': C.urban },
    },
    {
      id: 'runway',
      type: 'line',
      ...src,
      'source-layer': 'aeroway',
      minzoom: 10,
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'class'], 'runway']],
      paint: { 'line-color': C.road, 'line-width': grow([10, 1.5], [15, 28]) },
    },
    // Courts and pitches: the one accent on the base map.
    {
      id: 'sport',
      type: 'fill',
      ...src,
      'source-layer': 'landuse',
      minzoom: 12,
      filter: ['in', ['get', 'class'], ['literal', ['pitch', 'stadium', 'track']]],
      paint: { 'fill-color': C.sport, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 15, 0.95] },
    },
    {
      id: 'sport-line',
      type: 'line',
      ...src,
      'source-layer': 'landuse',
      minzoom: 15,
      filter: ['in', ['get', 'class'], ['literal', ['pitch', 'stadium', 'track']]],
      paint: { 'line-color': C.sportLine, 'line-width': 1 },
    },
    {
      id: 'building',
      type: 'fill',
      ...src,
      'source-layer': 'building',
      minzoom: 14,
      paint: {
        'fill-color': C.building,
        'fill-outline-color': C.buildingLine,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 1],
      },
    },
    {
      id: 'rail',
      type: 'line',
      ...src,
      'source-layer': 'transportation',
      minzoom: 11,
      filter: ['all', ['==', ['get', 'class'], 'rail'], ['!', ['has', 'service']]],
      paint: { 'line-color': C.rail, 'line-width': grow([11, 0.6], [16, 2]), 'line-dasharray': [4, 2] },
    },
    road('path', ['path', 'track'], C.road, grow([14, 0.6], [18, 3]), 14, { 'line-dasharray': [2, 1.5] }),
    // casings first, fills on top, so that crossings join
    road('street-case', ['minor', 'service'], C.roadCase, grow([13, 1.2], [18, 17]), 13),
    road('avenue-case', ['secondary', 'tertiary'], C.roadCase, grow([10, 1.4], [18, 25]), 10),
    road('main-case', ['primary', 'trunk'], C.roadCase, grow([8, 1.6], [18, 31]), 8),
    road('highway-case', ['motorway'], C.highwayCase, grow([6, 1.4], [18, 35]), 6),
    road('street', ['minor', 'service'], C.road, grow([12, 0.5], [18, 14]), 12),
    road('avenue', ['secondary', 'tertiary'], C.road, grow([9, 0.6], [18, 22]), 9),
    road('main', ['primary', 'trunk'], C.road, grow([7, 0.8], [18, 28]), 7),
    road('highway', ['motorway'], C.highway, grow([6, 0.8], [18, 32]), 6),
    {
      id: 'border',
      type: 'line',
      ...src,
      'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': C.border, 'line-width': grow([3, 0.8], [10, 2]), 'line-dasharray': [3, 2] },
    },

    // ── names ──
    {
      id: 'water-name',
      type: 'symbol',
      ...src,
      'source-layer': 'water_name',
      minzoom: 9,
      layout: { 'text-field': name, 'text-font': FONT, 'text-size': 12, 'text-max-width': 6, 'text-letter-spacing': 0.05 },
      paint: { 'text-color': C.waterInk, 'text-halo-color': C.halo, 'text-halo-width': 1 },
    },
    {
      id: 'street-name',
      type: 'symbol',
      ...src,
      'source-layer': 'transportation_name',
      minzoom: 13,
      filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway']]],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 320,
        'text-field': name,
        'text-font': FONT,
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10.5, 17, 13],
        'text-letter-spacing': 0.02,
      },
      paint: { 'text-color': C.inkSoft, 'text-halo-color': C.halo, 'text-halo-width': 1.4 },
    },
    {
      id: 'quarter',
      type: 'symbol',
      ...src,
      'source-layer': 'place',
      minzoom: 11,
      maxzoom: 16,
      filter: ['in', ['get', 'class'], ['literal', ['suburb', 'quarter', 'neighbourhood']]],
      layout: {
        'text-field': name,
        'text-font': FONT_BOLD,
        'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 15, 12.5],
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.09,
        'text-max-width': 7,
        'text-padding': 8,
      },
      paint: { 'text-color': C.inkFaint, 'text-halo-color': C.halo, 'text-halo-width': 1.4 },
    },
    {
      id: 'town',
      type: 'symbol',
      ...src,
      'source-layer': 'place',
      minzoom: 8,
      maxzoom: 15,
      filter: ['in', ['get', 'class'], ['literal', ['town', 'village']]],
      layout: {
        'text-field': name,
        'text-font': FONT,
        'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 13, 14],
        'text-max-width': 7,
      },
      paint: { 'text-color': C.inkSoft, 'text-halo-color': C.halo, 'text-halo-width': 1.5 },
    },
    {
      id: 'city',
      type: 'symbol',
      ...src,
      'source-layer': 'place',
      minzoom: 4,
      maxzoom: 13,
      filter: ['==', ['get', 'class'], 'city'],
      layout: {
        'text-field': name,
        'text-font': FONT_BOLD,
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 8, 15, 12, 20],
        'text-max-width': 7,
        'symbol-sort-key': ['get', 'rank'],
      },
      paint: { 'text-color': C.ink, 'text-halo-color': C.halo, 'text-halo-width': 1.8 },
    },
    {
      id: 'country',
      type: 'symbol',
      ...src,
      'source-layer': 'place',
      maxzoom: 7,
      filter: ['==', ['get', 'class'], 'country'],
      layout: {
        'text-field': name,
        'text-font': FONT_BOLD,
        'text-size': ['interpolate', ['linear'], ['zoom'], 2, 11, 6, 16],
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.12,
        'text-max-width': 6,
      },
      paint: { 'text-color': C.inkSoft, 'text-halo-color': C.halo, 'text-halo-width': 1.6 },
    },
  ];
  return list as LayerSpecification[];
}

export function buildMapStyle(
  locale: string,
  base: { source: VectorSourceSpecification; glyphs: string } = { source: FALLBACK_SOURCE, glyphs: FALLBACK_GLYPHS },
): StyleSpecification {
  return {
    version: 8,
    name: 'PlaySlot',
    glyphs: base.glyphs,
    sources: { osm: base.source },
    layers: layers(locale),
  };
}

/**
 * The style, pointed at wherever OpenFreeMap serves its tiles from today: the
 * address carries a build date and moves, and their own style file is the one
 * place that always has the current one. If that cannot be read in a few
 * seconds, the documented permanent address is used.
 */
export async function loadMapStyle(locale: string): Promise<StyleSpecification> {
  try {
    const res = await fetch(OFM_STYLE, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(String(res.status));
    const ofm = (await res.json()) as { glyphs?: string; sources?: Record<string, VectorSourceSpecification> };
    const source = ofm.sources?.openmaptiles;
    if (source?.type === 'vector' && ofm.glyphs) return buildMapStyle(locale, { source, glyphs: ofm.glyphs });
  } catch {
    /* fall through to the permanent address */
  }
  return buildMapStyle(locale);
}
