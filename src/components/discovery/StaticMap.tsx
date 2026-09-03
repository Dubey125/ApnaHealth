import Link from "next/link";
import { cn } from "@/components/ui/cn";
import {
  boundsCentre,
  buildViewport,
  fitZoom,
  projectToViewport,
  TILE_PIXELS,
  viewportTiles,
} from "@/lib/geo/tiles";
import type { Coordinates } from "@/lib/geo/distance";
import { mapTileConfig } from "@/lib/geo/mapTiles";

// A map of the facilities on this page, rendered on the server.
//
// No mapping library and no API key: the tiles are plain <img> elements
// positioned by the projection maths in lib/geo/tiles.ts, and every pin is
// a real <Link>. That means it renders with JavaScript off, adds nothing to
// the client bundle, and costs nothing to run.
//
// What it deliberately is not: a slippy map. There is no pan, no zoom, no
// drag. It answers "where are these, roughly, and which is nearest me",
// which is the question a discovery page raises; anything more specific is
// what the Directions link on each card is for.

export interface MapMarker {
  key: string;
  latitude: number;
  longitude: number;
  label: string;
  href: string;
  /** Shown inside the pin — usually its position in the results list. */
  badge?: string;
}

export function StaticMap({
  markers,
  viewerOrigin,
  width = 1024,
  height = 320,
  className,
}: {
  markers: MapMarker[];
  /** The patient's search origin, if they shared one. */
  viewerOrigin?: Coordinates | null;
  width?: number;
  height?: number;
  className?: string;
}) {
  if (markers.length === 0) return null;

  const tiles = mapTileConfig();

  // The viewer's own position is part of what has to fit: a map that
  // frames the clinics perfectly but crops out "you are here" answers the
  // wrong question.
  const points: Coordinates[] = [
    ...markers.map(({ latitude, longitude }) => ({ latitude, longitude })),
    ...(viewerOrigin ? [viewerOrigin] : []),
  ];

  const centre = boundsCentre(points);
  if (!centre) return null;

  const zoom = fitZoom(points, width, height);
  const viewport = buildViewport(centre, zoom, width, height);

  return (
    <figure className={cn("flex flex-col gap-1.5", className)}>
      <div
        // aspect-ratio + w-full keeps the picture responsive while the
        // projection stays fixed: the tiles and pins scale together, so a
        // pin never drifts off its building on a narrow screen.
        className="relative w-full overflow-hidden rounded-xl border border-border bg-border/30"
        style={{ aspectRatio: `${width} / ${height}` }}
        role="img"
        aria-label={
          viewerOrigin
            ? `Map showing ${markers.length} ${markers.length === 1 ? "facility" : "facilities"} near your location`
            : `Map showing ${markers.length} ${markers.length === 1 ? "facility" : "facilities"}`
        }
      >
        <div className="absolute inset-0" style={{ width: `${width}px`, height: `${height}px` }}>
          {tiles.enabled &&
            viewportTiles(viewport).map((tile) => (
              /* Plain <img>, not next/image: these are third-party map
                 tiles, and next/image would have the SERVER fetch each one
                 — hundreds of requests per page and the same SSRF-shaped
                 concern as lib/images.ts. */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${tile.z}/${tile.x}/${tile.y}`}
                src={tiles.urlTemplate
                  .replace("{z}", String(tile.z))
                  .replace("{x}", String(tile.x))
                  .replace("{y}", String(tile.y))}
                alt=""
                aria-hidden="true"
                width={TILE_PIXELS}
                height={TILE_PIXELS}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="absolute max-w-none select-none"
                style={{ left: tile.left, top: tile.top, width: TILE_PIXELS, height: TILE_PIXELS }}
              />
            ))}

          {viewerOrigin &&
            (() => {
              const { left, top } = projectToViewport(viewerOrigin, viewport);
              return (
                <span
                  aria-hidden="true"
                  className="absolute z-10 block h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-info shadow"
                  style={{ left, top }}
                  title="Your approximate location"
                />
              );
            })()}

          {markers.map((marker) => {
            const { left, top } = projectToViewport(marker, viewport);
            return (
              <Link
                key={marker.key}
                href={marker.href}
                title={marker.label}
                className="absolute z-20 -translate-x-1/2 -translate-y-full focus-visible:outline-none"
                style={{ left, top }}
              >
                <span className="sr-only">{marker.label}</span>
                <span
                  aria-hidden="true"
                  className="flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-white bg-primary px-1.5 text-xs font-bold text-primary-foreground shadow-md transition-transform hover:scale-110"
                >
                  {marker.badge ?? "•"}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Attribution is a licence condition of every open tile source, not
          a nicety — see docs/product/MAP_TILES.md. */}
      <figcaption className="text-xs text-muted">
        {tiles.enabled ? (
          <>
            Approximate locations ·{" "}
            <a
              href={tiles.attributionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {tiles.attribution}
            </a>
          </>
        ) : (
          <>Approximate relative positions. No map background is configured.</>
        )}
      </figcaption>
    </figure>
  );
}
