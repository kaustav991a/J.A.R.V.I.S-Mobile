import { labelAt, mapPlot } from '../placeMap';

/**
 * The picture that makes an overlap arguable instead of theoretical.
 *
 * Asked for after Home and a named area 150 metres apart turned out to be sitting
 * inside each other's match circles: *"can I see the radius and the overlapped area?"*
 * A map with tiles would answer a different question — this one is about how big the
 * circles are relative to the gap between them, which is drawing, not cartography.
 *
 * Metres are projected flat. Over a few hundred metres the curvature is irrelevant and
 * a flat projection keeps the circles round, which is the whole point: a radius that
 * renders as an ellipse cannot be compared by eye to the one beside it.
 */

const HOME = { id: 'home', label: 'Home', lat: 22.75, lon: 88.37, area: '' };
/** about 150 m north */
const AREA = { id: 'area', label: 'My area', lat: 22.75135, lon: 88.37, area: '' };

describe('plotting the places and the reading', () => {
  const plot = mapPlot({
    places: [HOME, AREA],
    fix: { lat: 22.75135, lon: 88.37, accuracy: 20 },
    radiusM: 120,
    size: 300,
  });

  it('draws every named place', () => {
    expect(plot.places.map((p) => p.label).sort()).toEqual(['Home', 'My area']);
  });

  it('keeps the radius in proportion to the distance between them', () => {
    // the report in one number: two circles of 120 m, 150 m apart, so they overlap
    const [a, b] = plot.places;
    const apart = Math.hypot(a.x - b.x, a.y - b.y);
    expect(apart).toBeGreaterThan(0);
    expect(a.r * 2).toBeGreaterThan(apart);
  });

  it('says which places overlap, so the picture does not have to be interpreted', () => {
    expect(plot.overlapping).toBe(true);
  });

  it('marks where the reading puts you, with its own error circle', () => {
    expect(plot.you).not.toBeNull();
    expect(plot.you!.r).toBeGreaterThan(0);
  });

  it('fits everything inside the canvas', () => {
    for (const p of plot.places) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(300);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(300);
    }
  });

  it('scales metres to pixels at one honest rate, so the scale bar can be read', () => {
    expect(plot.metresPerPixel).toBeGreaterThan(0);
    const [a, b] = plot.places;
    const apartM = Math.hypot(a.x - b.x, a.y - b.y) * plot.metresPerPixel;
    expect(apartM).toBeGreaterThan(130);
    expect(apartM).toBeLessThan(170);
  });
});

describe('when there is little to draw', () => {
  it('still plots a single place without dividing by zero', () => {
    const plot = mapPlot({ places: [HOME], fix: null, radiusM: 120, size: 300 });
    expect(plot.places).toHaveLength(1);
    expect(Number.isFinite(plot.places[0].x)).toBe(true);
    expect(plot.you).toBeNull();
    expect(plot.overlapping).toBe(false);
  });

  it('has nothing to say with no places and no reading', () => {
    const plot = mapPlot({ places: [], fix: null, radiusM: 120, size: 300 });
    expect(plot.places).toEqual([]);
    expect(plot.you).toBeNull();
  });

  it('plots the reading alone when nothing has been named yet', () => {
    const plot = mapPlot({ places: [], fix: { lat: 22.75, lon: 88.37, accuracy: 30 }, radiusM: 120, size: 300 });
    expect(plot.you).not.toBeNull();
  });

  it('does not call two distant places overlapping', () => {
    const office = { id: 'office', label: 'Office', lat: 22.58, lon: 88.43, area: '' };
    const plot = mapPlot({ places: [HOME, office], fix: null, radiusM: 120, size: 300 });
    expect(plot.overlapping).toBe(false);
  });
});

/**
 * Only what is near, because the far ones make the near ones invisible.
 *
 * Reported from the office: no circles, no gap, just dots. Ten named places spread
 * across forty kilometres of one city, and a plot scaled to hold all of them puts
 * about a hundred and fifty metres in every pixel — so a 120 m match circle draws at
 * under one pixel and the whole point of the panel disappears.
 *
 * The panel answers "how do the circles around me sit relative to each other", which
 * is a question about a few hundred metres. Everything past that belongs on a map,
 * and this was never a map.
 */
describe('keeping the drawing to the scale of the question', () => {
  const HOME_P = { id: 'home', label: 'Home', lat: 22.75, lon: 88.37, area: '' };
  const AREA_P = { id: 'area', label: 'My area', lat: 22.75135, lon: 88.37, area: '' };
  /** about 20 km south, which is what flattens the scale */
  const OFFICE_P = { id: 'office', label: 'Office', lat: 22.58, lon: 88.43, area: '' };

  it('leaves out places that are nowhere near you', () => {
    const plot = mapPlot({
      places: [HOME_P, AREA_P, OFFICE_P],
      fix: { lat: 22.75, lon: 88.37, accuracy: 15 },
      size: 300,
    });
    expect(plot.places.map((p) => p.label).sort()).toEqual(['Home', 'My area']);
  });

  it('says how many it left out, rather than quietly dropping them', () => {
    const plot = mapPlot({
      places: [HOME_P, AREA_P, OFFICE_P],
      fix: { lat: 22.75, lon: 88.37, accuracy: 15 },
      size: 300,
    });
    expect(plot.hidden).toBe(1);
  });

  it('keeps the circles big enough to be looked at', () => {
    // the report in one assertion: a radius under a pixel is not a drawing
    const plot = mapPlot({
      places: [HOME_P, AREA_P, OFFICE_P],
      fix: { lat: 22.75, lon: 88.37, accuracy: 15 },
      size: 300,
    });
    for (const p of plot.places) expect(p.r).toBeGreaterThan(10);
  });

  it('centres on you when you are at a place with no named neighbours', () => {
    const plot = mapPlot({
      places: [HOME_P, AREA_P, OFFICE_P],
      fix: { lat: 22.58, lon: 88.43, accuracy: 15 },
      size: 300,
    });
    expect(plot.places.map((p) => p.label)).toEqual(['Office']);
    expect(plot.hidden).toBe(2);
    expect(plot.places[0].r).toBeGreaterThan(10);
  });

  it('falls back to the places themselves when there is no reading', () => {
    const plot = mapPlot({ places: [HOME_P, AREA_P, OFFICE_P], fix: null, size: 300 });
    // no fix to centre on, so it shows the cluster around the first named place
    expect(plot.places.map((p) => p.label).sort()).toEqual(['Home', 'My area']);
  });
});

describe('keeping a label on the canvas', () => {
  it('centres a label with room on both sides', () => {
    expect(labelAt(150, 300)).toEqual({ x: 150, anchor: 'middle' });
  });

  it('anchors a label at the left edge to its start, so it cannot be cut in half', () => {
    // seen on the phone: "or V Metro Station", because the circle sat at the edge
    expect(labelAt(20, 300)).toEqual({ x: 4, anchor: 'start' });
  });

  it('anchors a label at the right edge to its end', () => {
    expect(labelAt(285, 300)).toEqual({ x: 296, anchor: 'end' });
  });
});

/**
 * The tilted view, and why the dot is a column rather than a point.
 *
 * Asked as *"GPS can get altitude, so may we show the dot in 3d space"*. It can, and
 * the honest version has to carry its own error: vertical accuracy runs one and a half
 * to three times the horizontal, so a reading good to 15 m on the ground is good to
 * perhaps 40 in height — and a floor is about three. Drawn as a point, that noise
 * would look like a measurement.
 *
 * So the height is drawn as a band spanning the error, with the reading inside it. It
 * is the same rule every remark in this app follows: name the figure, show what it
 * cannot tell you.
 */
describe('tilting the plot', () => {
  const HERE = { lat: 22.75, lon: 88.37, accuracy: 12, altitude: 24, altitudeAccuracy: 30 };
  const HOME_T = { id: 'home', label: 'Home', lat: 22.75, lon: 88.37, area: '' };

  it('flattens the ground plane, so a circle reads as a surface', () => {
    const flat = mapPlot({ places: [HOME_T], fix: HERE, size: 300 });
    const tilted = mapPlot({ places: [HOME_T], fix: HERE, size: 300, tilt: true });
    expect(tilted.groundSquash).toBeLessThan(1);
    expect(flat.groundSquash).toBe(1);
  });

  it('lifts the reading by its height', () => {
    const tilted = mapPlot({ places: [HOME_T], fix: HERE, size: 300, tilt: true });
    expect(tilted.you!.lift).toBeGreaterThan(0);
  });

  it('draws the height as a band spanning the error, not a point', () => {
    const tilted = mapPlot({ places: [HOME_T], fix: HERE, size: 300, tilt: true });
    // 30 m of error against a 3 m floor: the band is the honest shape
    expect(tilted.you!.liftError).toBeGreaterThan(tilted.you!.lift * 0.5);
  });

  it('lifts nothing when the phone reports no height', () => {
    const noAlt = { lat: 22.75, lon: 88.37, accuracy: 12 };
    const tilted = mapPlot({ places: [HOME_T], fix: noAlt, size: 300, tilt: true });
    expect(tilted.you!.lift).toBe(0);
  });

  it('leaves the flat view alone, which is the one that answers the overlap question', () => {
    const flat = mapPlot({ places: [HOME_T], fix: HERE, size: 300 });
    expect(flat.you!.lift).toBe(0);
  });
});
