import { AT_PLACE_KM } from './knownPlaces';
import type { KnownPlace } from './knownPlaces';

/**
 * The named places, their match circles, and where the phone thinks you are — as
 * coordinates on a square canvas.
 *
 * **Asked for after a real confusion**, and it answers that confusion rather than
 * being a map: Home and a named area about 150 metres apart, each sitting inside the
 * other's 250-metre match circle, so walking between them never changed what the app
 * said. The circles are drawn to the same scale as the gap between them, which turns
 * *"maybe they overlap"* into something you can see and disagree with.
 *
 * Pure, and separate from the component for the usual reason here: the arithmetic that
 * decides whether two circles touch is the part worth pinning with tests, and it
 * should not need a renderer to ask.
 *
 * **Metres are projected flat.** Over a few hundred metres the curvature of the earth
 * is irrelevant, and a flat projection keeps circles round — a radius drawn as an
 * ellipse cannot be compared by eye with the one beside it, which is the entire job.
 */

export type Plotted = {
  label: string;
  x: number;
  y: number;
  /** the match radius, in pixels at this plot's scale */
  r: number;
};

export type Plot = {
  places: Plotted[];
  /** where the reading puts you, with its own error as the radius */
  you: { x: number; y: number; r: number } | null;
  /** whether any two match circles touch — the thing the picture was asked for */
  overlapping: boolean;
  /** so a scale bar can be drawn, and the picture read as a measurement */
  metresPerPixel: number;
  /**
   * Named places left out for being nowhere near.
   *
   * Counted rather than silently dropped: a panel that shows two of your ten
   * places without saying so is lying by omission about what it has drawn.
   */
  hidden: number;
};

const M_PER_DEG_LAT = 111_320;

/**
 * How far away a named place can be and still belong in the picture.
 *
 * Wide enough to hold a house, the street it is on and the next named corner —
 * which is the scale the overlap question lives at — and tight enough that a place
 * across the city cannot flatten the drawing into dots.
 */
export const NEAR_M = 800;


/** metres east and north of a reference point — flat, which is fine at this size */
const project = (
  p: { lat: number; lon: number },
  origin: { lat: number; lon: number }
): { east: number; north: number } => ({
  east: (p.lon - origin.lon) * M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180),
  north: (p.lat - origin.lat) * M_PER_DEG_LAT,
});

export function mapPlot(input: {
  places: KnownPlace[];
  fix: { lat: number; lon: number; accuracy?: number } | null;
  /** the match radius in metres; defaults to the one the matcher actually uses */
  radiusM?: number;
  /** how far from the centre a place can be and still be worth drawing, in metres */
  nearM?: number;
  /** canvas edge, in pixels */
  size: number;
}): Plot {
  const radiusM = input.radiusM ?? AT_PLACE_KM * 1000;
  const nearM = input.nearM ?? NEAR_M;

  /**
   * Only the places near the middle of the question get drawn.
   *
   * Reported from the office: no circles, just dots. Ten named places across forty
   * kilometres, and a plot scaled to hold all of them puts a hundred and fifty
   * metres in a pixel — so a 120 m circle draws at less than one, and the panel
   * shows nothing it exists to show. The question is about a few hundred metres
   * either way; everything past that belongs on a map, and this is not one.
   */
  const centre = input.fix ?? input.places[0] ?? null;
  if (!centre) {
    return { places: [], you: null, overlapping: false, metresPerPixel: 1, hidden: 0 };
  }

  const withDistance = input.places.map((place) => {
    const m = project(place, centre);
    return { place, away: Math.hypot(m.east, m.north) };
  });
  const shown = withDistance.filter((x) => x.away <= nearM).map((x) => x.place);
  const hidden = withDistance.length - shown.length;

  const points = [
    ...shown.map((p) => ({ lat: p.lat, lon: p.lon })),
    ...(input.fix ? [{ lat: input.fix.lat, lon: input.fix.lon }] : []),
  ];

  if (!points.length) {
    return { places: [], you: null, overlapping: false, metresPerPixel: 1, hidden };
  }

  const origin = {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lon: points.reduce((s, p) => s + p.lon, 0) / points.length,
  };
  const projected = points.map((p) => project(p, origin));

  /**
   * The span has to include the circles, not only their centres.
   *
   * A plot scaled to the centres alone clips every circle in half at the edge, and a
   * half-drawn radius is exactly the thing somebody is trying to judge.
   */
  const reach = Math.max(
    radiusM,
    input.fix?.accuracy ?? 0,
    ...projected.map((p) => Math.max(Math.abs(p.east), Math.abs(p.north)))
  );
  const span = (reach + radiusM) * 2;
  const metresPerPixel = span / input.size;
  const toCanvas = (m: { east: number; north: number }) => ({
    x: input.size / 2 + m.east / metresPerPixel,
    // north is up, and canvas y grows downward
    y: input.size / 2 - m.north / metresPerPixel,
  });

  const places = shown.map((p) => ({
    label: p.label,
    ...toCanvas(project(p, origin)),
    r: radiusM / metresPerPixel,
  }));

  const you = input.fix
    ? {
        ...toCanvas(project(input.fix, origin)),
        // a reading with no stated error still gets a dot rather than nothing
        r: Math.max(input.fix.accuracy ?? 0, 1) / metresPerPixel,
      }
    : null;

  let overlapping = false;
  for (let i = 0; i < places.length && !overlapping; i += 1) {
    for (let j = i + 1; j < places.length; j += 1) {
      const apart = Math.hypot(places[i].x - places[j].x, places[i].y - places[j].y);
      if (apart < places[i].r + places[j].r) {
        overlapping = true;
        break;
      }
    }
  }

  return { places, you, overlapping, metresPerPixel, hidden };
}

/** how much of the canvas edge a label must keep clear of */
const LABEL_EDGE_PX = 60;

/**
 * Where to put a place's label, and which way to hang it.
 *
 * Seen on the phone: a circle near the left edge rendered as *"or V Metro Station"* —
 * an SVG label centred on its circle runs off the canvas, and the platform clips it
 * rather than wrapping. So a label close to an edge hangs from that edge instead of
 * from its own middle.
 */
export function labelAt(x: number, size: number): { x: number; anchor: 'start' | 'middle' | 'end' } {
  if (x < LABEL_EDGE_PX) return { x: 4, anchor: 'start' };
  if (x > size - LABEL_EDGE_PX) return { x: size - 4, anchor: 'end' };
  return { x, anchor: 'middle' };
}
