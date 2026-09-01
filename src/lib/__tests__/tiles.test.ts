import { TILE_PX, tilesFor } from '../tiles';

/**
 * Real roads under the circles, without a native map and without a key.
 *
 * Asked for as *"can we have the map road"*, and the honest answer turned out to be
 * yes: a slippy-map tile is a PNG at a URL, and an `Image` can load one. Every actual
 * map component on Android is a native module and therefore a new build, so this is
 * the version that ships over the air today.
 *
 * **Mercator, not the flat projection the circles use.** Over a few hundred metres the
 * two agree to within a metre or so, but the tiles are drawn in Mercator by
 * definition, so the alignment maths has to be theirs rather than ours or the roads
 * would slide against the markers.
 */

/** the office, roughly */
const AT = { lat: 22.5806, lon: 88.4304 };

describe('choosing tiles for a view', () => {
  const view = tilesFor({ centre: AT, metresPerPixel: 6, size: 260 });

  it('picks a zoom whose pixels are near the ones being drawn', () => {
    // a tile scaled far from its natural size is either blurred or wasteful
    expect(view.zoom).toBeGreaterThanOrEqual(14);
    expect(view.zoom).toBeLessThanOrEqual(18);
  });

  it('covers the canvas', () => {
    const right = Math.max(...view.tiles.map((t) => t.left + view.tileSize));
    const bottom = Math.max(...view.tiles.map((t) => t.top + view.tileSize));
    expect(Math.min(...view.tiles.map((t) => t.left))).toBeLessThanOrEqual(0);
    expect(Math.min(...view.tiles.map((t) => t.top))).toBeLessThanOrEqual(0);
    expect(right).toBeGreaterThanOrEqual(260);
    expect(bottom).toBeGreaterThanOrEqual(260);
  });

  it('asks for a sane number of them', () => {
    // one screenful, not a download: the tile servers are somebody else's gift
    expect(view.tiles.length).toBeLessThanOrEqual(16);
    expect(view.tiles.length).toBeGreaterThan(0);
  });

  it('addresses each tile properly', () => {
    for (const t of view.tiles) {
      expect(t.url).toMatch(/^https:\/\/[a-z.]+\/\d+\/\d+\/\d+\.png$/);
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThan(2 ** view.zoom);
      expect(t.y).toBeLessThan(2 ** view.zoom);
    }
  });

  it('puts the centre of the view at the centre of the canvas', () => {
    // the marker for "you" sits at the canvas centre when the plot is centred on the
    // reading, so the tile under it has to agree or the roads are simply wrong
    const covering = view.tiles.find(
      (t) =>
        t.left <= 130 && t.left + view.tileSize >= 130 && t.top <= 130 && t.top + view.tileSize >= 130
    );
    expect(covering).toBeTruthy();
  });

  it('scales its tiles to the plot rather than assuming 256 pixels', () => {
    const tight = tilesFor({ centre: AT, metresPerPixel: 1.5, size: 260 });
    expect(tight.tileSize).toBeGreaterThan(0);
    expect(tight.tileSize).not.toBe(TILE_PX);
  });
});

describe('when a view makes no sense', () => {
  it('asks for nothing at an absurd scale rather than a thousand tiles', () => {
    // the whole country in one panel: no zoom answers it, and hammering a free tile
    // server is somebody else's bandwidth
    expect(tilesFor({ centre: AT, metresPerPixel: 4000, size: 260 }).tiles.length).toBeLessThanOrEqual(16);
  });
});
