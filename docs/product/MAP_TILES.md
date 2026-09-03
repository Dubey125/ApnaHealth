# Map tiles

The discovery pages and facility profiles show a static map. It is rendered
on the server from the projection maths in `src/lib/geo/tiles.ts` — there is
no mapping library, no client JavaScript and no API key.

## Why no map library

Leaflet plus react-leaflet is two new dependencies (which `CLAUDE.md`
forbids without approval), roughly 150 KB of client JavaScript, and a map
that renders nothing until it has hydrated. The question a discovery page
raises is "where are these, roughly, and which is nearest me" — a picture
answers it. Pan and zoom would not add to that answer, and the Directions
link on every card already hands off to a real map application for the
journey itself.

Consequences worth knowing:

- the map renders with JavaScript disabled;
- every pin is a real `<Link>`, so it is keyboard reachable and crawlable;
- it costs nothing in bundle size.

## The tile source is not production-ready

`MAP_TILE_URL` defaults to `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
because it is free and needs no key, which is what makes a map possible here
at all without a billing relationship.

**OpenStreetMap's Tile Usage Policy forbids heavy use by applications.** The
tiles are served on donated hardware for the project's own benefit, not as a
CDN. This default is right for development and acceptable for a single-clinic
pilot. It is not right for launch.

Moving off it is a one-line change:

```
MAP_TILE_URL=https://tiles.example.com/{z}/{x}/{y}.png
MAP_TILE_ATTRIBUTION=© Example Maps
MAP_TILE_ATTRIBUTION_URL=https://example.com/attribution
```

Options, cheapest first: self-host a renderer or a pre-rendered tile set;
use a provider's free tier with a key (most offer one at this volume).

Setting `MAP_TILE_URL=off` disables the basemap entirely — the map still
renders its pins on a plain background. That is the right setting for a
deployment that would rather show no map than send patients' browsers to a
third party at all.

## Privacy

Tiles are fetched by the **viewer's browser**, not the server, so the tile
host sees each viewer's IP address and which tiles they requested — which
approximates the area they were looking at. Three things limit it:

- `referrerPolicy="no-referrer"` on every tile, so the host never learns
  which page (and therefore which doctor or facility) was being viewed;
- the patient's own position is never a tile request — it is drawn client-
  side over tiles that were requested for the *results*, and the search
  coordinates are already coarsened to ~100 m before they leave the browser
  (`src/lib/geo/searchParams.ts`);
- `MAP_TILE_URL=off` removes the third party from the page completely.

Self-hosting tiles removes the concern rather than mitigating it, and is the
recommended end state.

## Attribution

Attribution is a licence condition of every open tile source, not a nicety.
It is derived from the configured URL in `src/lib/geo/mapTiles.ts` and
rendered in the map's `<figcaption>`, so it cannot be forgotten by whoever
places a map on a new page.
