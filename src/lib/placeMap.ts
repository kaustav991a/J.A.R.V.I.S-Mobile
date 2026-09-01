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
};

const M_PER_DEG_LAT = 111_320;

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
  /** canvas edge, in pixels */
  size: number;
}): Plot {
  const radiusM = input.radiusM ?? AT_PLACE_KM * 1000;
  const points = [
    ...input.places.map((p) => ({ lat: p.lat, lon: p.lon })),
    ...(input.fix ? [{ lat: input.fix.lat, lon: input.fix.lon }] : []),
  ];

  if (!points.length) {
    return { places: [], you: null, overlapping: false, metresPerPixel: 1 };
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

  const places = input.places.map((p) => ({
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

  return { places, you, overlapping, metresPerPixel };
}
