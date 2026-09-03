import type { Coordinates } from "./distance";

// Web Mercator tile maths, for a server-rendered static map.
//
// Deliberately no mapping library. Leaflet plus react-leaflet would be two
// new dependencies (CLAUDE.md forbids that without approval), ~150KB of
// client JavaScript, and a map that renders nothing until it has hydrated.
// A slippy map is not what this page needs: the question a patient is
// asking is "where are these, roughly, relative to me" — which is answered
// by a picture, and a picture is 40 lines of projection maths plus an <img>
// grid.
//
// What that buys: the map is server-rendered, works with JavaScript off,
// costs no client bundle, and every pin is a real link.

const TILE_SIZE = 256;

/** Zoom bounds. Below 3 the whole world is one blur; above 17 OSM has no tiles for much of India. */
const MIN_ZOOM = 3;
const MAX_ZOOM = 17;

export interface TileRef {
  x: number;
  y: number;
  z: number;
}

/** Fractional tile coordinates — the pixel position within the tile grid. */
export interface TilePoint {
  x: number;
  y: number;
}

export function toTilePoint({ latitude, longitude }: Coordinates, zoom: number): TilePoint {
  const scale = 2 ** zoom;
  const latitudeRadians = (latitude * Math.PI) / 180;
  return {
    x: ((longitude + 180) / 360) * scale,
    // The Mercator y projection. Clamped input keeps tan() away from the
    // asymptote at the poles, where y would run to infinity.
    y:
      ((1 - Math.log(Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians)) / Math.PI) / 2) *
      scale,
  };
}

export interface MapViewport {
  zoom: number;
  /** Tile range covering the viewport, inclusive. */
  minTileX: number;
  maxTileX: number;
  minTileY: number;
  maxTileY: number;
  /** Pixel size of the rendered tile grid. */
  width: number;
  height: number;
  /** Pixel offset of the grid's top-left corner from the viewport's. */
  offsetX: number;
  offsetY: number;
}

/**
 * The zoom at which every point fits inside `width` x `height` pixels, with
 * a margin so no pin sits flush against an edge.
 *
 * A single point has no extent, so it gets a fixed neighbourhood zoom
 * rather than MAX_ZOOM — one clinic filling the screen at building level
 * tells a patient nothing about where it is.
 */
export function fitZoom(points: Coordinates[], width: number, height: number, marginPx = 48): number {
  if (points.length === 0) return MIN_ZOOM;
  if (points.length === 1) return 14;

  const usableWidth = Math.max(1, width - marginPx * 2);
  const usableHeight = Math.max(1, height - marginPx * 2);

  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom -= 1) {
    const projected = points.map((point) => toTilePoint(point, zoom));
    const spanX = (Math.max(...projected.map((p) => p.x)) - Math.min(...projected.map((p) => p.x))) * TILE_SIZE;
    const spanY = (Math.max(...projected.map((p) => p.y)) - Math.min(...projected.map((p) => p.y))) * TILE_SIZE;
    if (spanX <= usableWidth && spanY <= usableHeight) return zoom;
  }
  return MIN_ZOOM;
}

/**
 * The tile grid needed to cover a viewport centred on `centre`.
 *
 * Tiles are whole images, so the grid almost never lines up with the
 * viewport: `offsetX`/`offsetY` are how far to shift it so the centre lands
 * in the middle. They are negative, and the container clips the overhang.
 */
export function buildViewport(centre: Coordinates, zoom: number, width: number, height: number): MapViewport {
  const centrePoint = toTilePoint(centre, zoom);
  const scale = 2 ** zoom;

  const centrePixelX = centrePoint.x * TILE_SIZE;
  const centrePixelY = centrePoint.y * TILE_SIZE;
  const leftPixel = centrePixelX - width / 2;
  const topPixel = centrePixelY - height / 2;

  const minTileX = Math.floor(leftPixel / TILE_SIZE);
  const minTileY = Math.floor(topPixel / TILE_SIZE);
  const maxTileX = Math.floor((leftPixel + width) / TILE_SIZE);
  const maxTileY = Math.floor((topPixel + height) / TILE_SIZE);

  return {
    zoom,
    minTileX,
    maxTileX,
    // Clamped to the world: above and below the map there are no tiles, and
    // requesting y = -1 is a 404 on every tile server.
    minTileY: Math.max(0, minTileY),
    maxTileY: Math.min(scale - 1, maxTileY),
    width,
    height,
    offsetX: minTileX * TILE_SIZE - leftPixel,
    offsetY: Math.max(0, minTileY) * TILE_SIZE - topPixel,
  };
}

/** Every tile in the viewport, in row-major order, with its pixel position. */
export function viewportTiles(viewport: MapViewport): (TileRef & { left: number; top: number })[] {
  const scale = 2 ** viewport.zoom;
  const tiles: (TileRef & { left: number; top: number })[] = [];
  for (let y = viewport.minTileY; y <= viewport.maxTileY; y += 1) {
    for (let x = viewport.minTileX; x <= viewport.maxTileX; x += 1) {
      tiles.push({
        // Longitude wraps, so a viewport straddling the antimeridian asks
        // for tile -1, which is really tile (scale - 1).
        x: ((x % scale) + scale) % scale,
        y,
        z: viewport.zoom,
        left: (x - viewport.minTileX) * TILE_SIZE + viewport.offsetX,
        top: (y - viewport.minTileY) * TILE_SIZE + viewport.offsetY,
      });
    }
  }
  return tiles;
}

/** Where a coordinate lands inside the viewport, in pixels from its top-left. */
export function projectToViewport(point: Coordinates, viewport: MapViewport): { left: number; top: number } {
  const projected = toTilePoint(point, viewport.zoom);
  return {
    left: (projected.x - viewport.minTileX) * TILE_SIZE + viewport.offsetX,
    top: (projected.y - viewport.minTileY) * TILE_SIZE + viewport.offsetY,
  };
}

/** The geographic centre of a set of points — the midpoint of their bounds, not their mean. */
export function boundsCentre(points: Coordinates[]): Coordinates | null {
  if (points.length === 0) return null;
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  return {
    latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
  };
}

export const TILE_PIXELS = TILE_SIZE;
export const ZOOM_LIMITS = { min: MIN_ZOOM, max: MAX_ZOOM };
