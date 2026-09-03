import { test } from "node:test";
import assert from "node:assert/strict";
import {
  boundsCentre,
  buildViewport,
  fitZoom,
  projectToViewport,
  toTilePoint,
  viewportTiles,
} from "./tiles";

const KOREGAON_PARK = { latitude: 18.5362, longitude: 73.8939 };
const DECCAN = { latitude: 18.5158, longitude: 73.8408 };
const DELHI = { latitude: 28.6139, longitude: 77.209 };

test("the projection places 0,0 at the centre of the world at zoom 0", () => {
  const point = toTilePoint({ latitude: 0, longitude: 0 }, 0);
  assert.equal(point.x.toFixed(6), "0.500000");
  assert.equal(point.y.toFixed(6), "0.500000");
});

test("the projection puts the antimeridian at the edges", () => {
  assert.equal(toTilePoint({ latitude: 0, longitude: -180 }, 0).x, 0);
  assert.equal(toTilePoint({ latitude: 0, longitude: 180 }, 0).x, 1);
});

test("each zoom level doubles the tile grid", () => {
  const atZoom2 = toTilePoint(KOREGAON_PARK, 2);
  const atZoom3 = toTilePoint(KOREGAON_PARK, 3);
  assert.equal((atZoom2.x * 2).toFixed(9), atZoom3.x.toFixed(9));
  assert.equal((atZoom2.y * 2).toFixed(9), atZoom3.y.toFixed(9));
});

test("north is up: a higher latitude has a smaller y", () => {
  assert.ok(toTilePoint(DELHI, 10).y < toTilePoint(KOREGAON_PARK, 10).y);
});

test("a lone point gets a neighbourhood zoom, not the maximum", () => {
  const zoom = fitZoom([KOREGAON_PARK], 640, 360);
  assert.equal(zoom, 14, "one clinic filling the screen at building level says nothing about where it is");
});

test("two nearby points zoom in further than two distant ones", () => {
  const near = fitZoom([KOREGAON_PARK, DECCAN], 640, 360);
  const far = fitZoom([KOREGAON_PARK, DELHI], 640, 360);
  assert.ok(near > far, `expected ${near} > ${far}`);
});

test("the fitted zoom actually fits every point inside the viewport", () => {
  const points = [KOREGAON_PARK, DECCAN, DELHI];
  const width = 640;
  const height = 360;
  const zoom = fitZoom(points, width, height);
  const viewport = buildViewport(boundsCentre(points)!, zoom, width, height);

  for (const point of points) {
    const { left, top } = projectToViewport(point, viewport);
    assert.ok(left >= 0 && left <= width, `x ${left} outside 0..${width}`);
    assert.ok(top >= 0 && top <= height, `y ${top} outside 0..${height}`);
  }
});

test("the viewport centres on the point it was built around", () => {
  const viewport = buildViewport(KOREGAON_PARK, 13, 640, 360);
  const { left, top } = projectToViewport(KOREGAON_PARK, viewport);
  // Within a pixel of the middle, allowing for the tile grid's own offset.
  assert.ok(Math.abs(left - 320) < 1, `centre x was ${left}`);
  assert.ok(Math.abs(top - 180) < 1, `centre y was ${top}`);
});

test("the tile grid covers the whole viewport", () => {
  const width = 640;
  const height = 360;
  const viewport = buildViewport(KOREGAON_PARK, 13, width, height);
  const tiles = viewportTiles(viewport);
  assert.ok(tiles.length > 0);

  // Leftmost tile starts at or before 0; rightmost ends at or after the
  // viewport's edge. Any gap would render as a blank stripe.
  const left = Math.min(...tiles.map((tile) => tile.left));
  const right = Math.max(...tiles.map((tile) => tile.left)) + 256;
  const top = Math.min(...tiles.map((tile) => tile.top));
  const bottom = Math.max(...tiles.map((tile) => tile.top)) + 256;
  assert.ok(left <= 0, `left gap: ${left}`);
  assert.ok(right >= width, `right gap: ${right} < ${width}`);
  assert.ok(top <= 0, `top gap: ${top}`);
  assert.ok(bottom >= height, `bottom gap: ${bottom} < ${height}`);
});

// Every tile server 404s on an out-of-range index, which renders as a
// broken image rather than empty sky.
test("tile indices stay inside the world at every zoom", () => {
  for (const zoom of [3, 8, 13, 17]) {
    const viewport = buildViewport(KOREGAON_PARK, zoom, 640, 360);
    const scale = 2 ** zoom;
    for (const tile of viewportTiles(viewport)) {
      assert.ok(tile.x >= 0 && tile.x < scale, `x ${tile.x} outside 0..${scale} at z${zoom}`);
      assert.ok(tile.y >= 0 && tile.y < scale, `y ${tile.y} outside 0..${scale} at z${zoom}`);
    }
  }
});

test("a viewport near the poles asks for no tiles above or below the world", () => {
  const viewport = buildViewport({ latitude: 84, longitude: 0 }, 4, 640, 360);
  for (const tile of viewportTiles(viewport)) {
    assert.ok(tile.y >= 0, `negative tile y: ${tile.y}`);
  }
});

test("boundsCentre is the midpoint of the bounds, not the mean of the points", () => {
  // Three points clustered west and one far east: the mean would sit among
  // the cluster and push the outlier off-screen.
  const centre = boundsCentre([
    { latitude: 18.5, longitude: 73.0 },
    { latitude: 18.5, longitude: 73.1 },
    { latitude: 18.5, longitude: 73.2 },
    { latitude: 18.5, longitude: 77.0 },
  ]);
  assert.equal(centre?.longitude, 75);
});

test("boundsCentre of nothing is nothing", () => {
  assert.equal(boundsCentre([]), null);
});
