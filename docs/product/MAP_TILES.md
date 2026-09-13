# Maps — removed

The discovery and facility pages used to show a static map. **They no
longer do.** This file records why, and what to do if a map is ever wanted
again, because the reasoning is worth more than the code was.

## Why it was removed

OpenStreetMap started returning **HTTP 403 with an "Access blocked" image**
for our tile requests. Their Tile Usage Policy forbids application use of
`tile.openstreetmap.org` — it runs on donated hardware for the project's
own benefit — and we were relying on it as a default.

The failure was worse than a missing map. A 403 that returns *a picture*
still loads successfully as far as the browser is concerned, so `onerror`
never fired and the page rendered OpenStreetMap's error graphic, tiled,
inside our UI. A page cannot tell it has been refused.

The map was answering "where are these, roughly, and which is nearest me".
The result cards already carry a distance and a Directions link that hands
off to a real map application, so the map was the least load-bearing way
that question was answered — and the only one with a third-party
dependency, a privacy cost, and a licence condition attached.

## What went with it

- `src/components/discovery/StaticMap.tsx`
- `src/lib/geo/tiles.ts` and its tests — the Web Mercator projection
- `src/lib/geo/mapTiles.ts` — tile source configuration
- `MAP_TILE_URL`, `MAP_TILE_ATTRIBUTION`, `MAP_TILE_ATTRIBUTION_URL`
- the boot warning about an unset tile source

## What did NOT go with it

Everything that actually answers the question:

- `Clinic.latitude` / `Clinic.longitude` and their index — untouched;
- radius search, the bounding box and the haversine distance in
  `src/lib/geo/distance.ts` — untouched;
- "1.8 km away" on every card, nearest-first sorting, the "near me"
  flow — untouched;
- the Directions link on each card.

No schema, query or ranking behaviour changed. This was a picture being
removed, not a capability.

## If a map is wanted again

`git revert` the removal commit is the cheapest route, then set a tile
source that permits application use — a provider's free tier with a key,
OpenFreeMap's raster endpoint, or self-hosted tiles. **Do not point it back
at `tile.openstreetmap.org`**; that is what caused this.

Two constraints worth re-reading before anyone reaches for a map library:

**Attribution is a licence condition** of every open tile source, not a
nicety. The old implementation derived it from the configured URL so it
could not be forgotten.

**Vector tiles are a different architecture.** A style JSON such as
OpenFreeMap's Liberty cannot be consumed by `<img>` tags — it needs
MapLibre GL JS (~250 KB gzipped, WebGL, web workers). That would mean a new
dependency, a map that no longer renders server-side or without
JavaScript, pins that stop being crawlable `<Link>` elements, and a CSP
widened to allow `worker-src blob:`. The removed implementation avoided all
of that by rendering raster tiles on the server with no library at all.

## Privacy note, for whoever brings a map back

Tiles are fetched by the **viewer's browser**, so the tile host sees each
viewer's IP and which tiles they asked for — approximately the area they
were looking at. The old implementation limited that with
`referrerPolicy="no-referrer"` on every tile, and never made the patient's
own position a tile request. Self-hosting removes the concern rather than
mitigating it.
