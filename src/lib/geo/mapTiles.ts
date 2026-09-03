// Where map tiles come from.
//
// Configurable, and pointed at OpenStreetMap by default because it is free
// and needs no API key — which is the whole reason a map is possible here
// at all without a billing relationship.
//
// It is NOT a production tile source, and that matters enough to say twice.
// OpenStreetMap's Tile Usage Policy explicitly forbids heavy use of
// tile.openstreetmap.org by applications, and the project runs it on
// donated hardware. It is right for development and a pilot; a real launch
// needs its own tiles — a self-hosted renderer, or a provider's free tier
// with a key. Both are a MAP_TILE_URL change and nothing else.
//
// See docs/product/MAP_TILES.md.

export interface MapTileConfig {
  enabled: boolean;
  urlTemplate: string;
  attribution: string;
  attributionUrl: string;
}

const OSM_TEMPLATE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export function mapTileConfig(): MapTileConfig {
  // An explicit "off" is respected: a deployment that would rather show no
  // basemap than send its patients' browsers to a third party can say so,
  // and the map still renders pins on a plain background.
  const configured = (process.env.MAP_TILE_URL ?? "").trim();
  if (configured.toLowerCase() === "off") {
    return { enabled: false, urlTemplate: "", attribution: "", attributionUrl: "" };
  }

  const urlTemplate = configured.length > 0 ? configured : OSM_TEMPLATE;
  const isOsm = urlTemplate.includes("openstreetmap.org");

  return {
    enabled: true,
    urlTemplate,
    // Attribution is a licence condition, so it is derived from the source
    // rather than left to whoever renders the map to remember.
    attribution: isOsm
      ? "© OpenStreetMap contributors"
      : (process.env.MAP_TILE_ATTRIBUTION ?? "Map data © its contributors"),
    attributionUrl: isOsm
      ? "https://www.openstreetmap.org/copyright"
      : (process.env.MAP_TILE_ATTRIBUTION_URL ?? "https://www.openstreetmap.org/copyright"),
  };
}
