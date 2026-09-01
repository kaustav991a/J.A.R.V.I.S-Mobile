/**
 * Roads under the circles, without a native map component and without a key.
 *
 * Asked for as *"can we have the map road"*. Every real map on Android — Google's,
 * MapLibre, `react-native-maps` — is a native module, which means a new build and a
 * gap of days. A slippy-map tile is a PNG at a predictable URL, and an `Image` can
 * load one, so this version ships over the air the same afternoon.
 *
 * **Mercator, deliberately, and not the flat projection the circles use.** Over a few
 * hundred metres the two agree to within about a metre, but tiles are drawn in Web
 * Mercator by definition — so the alignment arithmetic has to be theirs, or the roads
 * would slide against the markers as you move north.
 *
 * **The tiles are somebody else's gift.** OpenStreetMap's servers are donated, the
 * usage policy asks for light and cached use, and attribution is required — the panel
 * carries it. This asks for one screenful at a time, at a zoom chosen so each tile is
 * drawn near its natural size, and it draws nothing at all at absurd scales rather
 * than pulling a hundred tiles nobody can read.
 */

/** the natural edge of a raster tile, in pixels */
export const TILE_PX = 256;

/** metres per pixel at the equator for zoom 0, which is where every tile scale comes from */
const EQUATOR_MPP = 156_543.03392;

/** no more than this many tiles for one panel, however odd the scale */
const MAX_TILES = 16;

const HOST = 'https://tile.openstreetmap.org';

export type Tile = {
  x: number;
  y: number;
  z: number;
  /** where to place this tile on the canvas, in pixels from its top-left */
  left: number;
  top: number;
  url: string;
};

export type TileView = {
  zoom: number;
  /** the edge each tile should be drawn at, so the map matches the plot's scale */
  tileSize: number;
  tiles: Tile[];
  /** shown under the panel, because the licence asks for it and it is fair */
  attribution: string;
};

const lonToX = (lon: number, z: number): number => ((lon + 180) / 360) * 2 ** z;

const latToY = (lat: number, z: number): number => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};

export function tilesFor(input: {
  centre: { lat: number; lon: number };
  /** the scale the circles are drawn at, so the roads underneath match them */
  metresPerPixel: number;
  size: number;
}): TileView {
  const { centre, metresPerPixel, size } = input;
  const attribution = '© OpenStreetMap';

  /**
   * The zoom whose natural pixels are closest to the ones being drawn.
   *
   * Then the tile is scaled the rest of the way, which is a fraction rather than a
   * factor — a tile stretched 4x is a blur, and one squeezed 4x is bandwidth thrown
   * away.
   */
  const mppAtZoom = (z: number) => (EQUATOR_MPP * Math.cos((centre.lat * Math.PI) / 180)) / 2 ** z;
  const ideal = Math.log2((EQUATOR_MPP * Math.cos((centre.lat * Math.PI) / 180)) / metresPerPixel);
  const zoom = Math.max(1, Math.min(19, Math.round(ideal)));

  // how big one tile must be drawn for its ground scale to match the plot's
  const tileSize = TILE_PX * (mppAtZoom(zoom) / metresPerPixel);
  if (!Number.isFinite(tileSize) || tileSize <= 0) {
    return { zoom, tileSize: TILE_PX, tiles: [], attribution };
  }

  // the centre in tile coordinates, and the fractional part inside its own tile
  const cx = lonToX(centre.lon, zoom);
  const cy = latToY(centre.lat, zoom);
  const half = size / 2;

  const first = { x: Math.floor(cx - half / tileSize), y: Math.floor(cy - half / tileSize) };
  const last = { x: Math.floor(cx + half / tileSize), y: Math.floor(cy + half / tileSize) };

  const tiles: Tile[] = [];
  const span = 2 ** zoom;
  for (let x = first.x; x <= last.x; x += 1) {
    for (let y = first.y; y <= last.y; y += 1) {
      if (x < 0 || y < 0 || x >= span || y >= span) continue;
      if (tiles.length >= MAX_TILES) return { zoom, tileSize, tiles, attribution };
      tiles.push({
        x,
        y,
        z: zoom,
        // where this tile's top-left lands, measured from the canvas centre
        left: half + (x - cx) * tileSize,
        top: half + (y - cy) * tileSize,
        url: `${HOST}/${zoom}/${x}/${y}.png`,
      });
    }
  }

  return { zoom, tileSize, tiles, attribution };
}
