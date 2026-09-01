import { mapPlot } from '../placeMap';

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
