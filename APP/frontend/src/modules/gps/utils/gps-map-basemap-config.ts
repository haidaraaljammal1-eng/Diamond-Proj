export type GpsMapBasemapKind = "map" | "satellite";

export const GPS_MAP_OSM_TILE_URL =
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

export const GPS_MAP_OSM_ATTRIBUTION = "OpenStreetMap";

/** Esri World Imagery — public ArcGIS MapServer tiles (see Esri Terms of Use). */
export const GPS_MAP_DEFAULT_SATELLITE_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export const GPS_MAP_DEFAULT_SATELLITE_ATTRIBUTION =
  "Esri, Maxar, Earthstar Geographics, and the GIS User Community";

export function resolveGpsSatelliteBasemap(): { url: string; attribution: string } | null {
  const explicitUrl = process.env.NEXT_PUBLIC_GPS_SATELLITE_TILE_URL?.trim();
  if (explicitUrl === "") return null;
  const url = explicitUrl || GPS_MAP_DEFAULT_SATELLITE_TILE_URL;
  const attribution =
    process.env.NEXT_PUBLIC_GPS_SATELLITE_ATTRIBUTION?.trim() ||
    GPS_MAP_DEFAULT_SATELLITE_ATTRIBUTION;
  return { url, attribution };
}

export function isGpsSatelliteBasemapEnabled(): boolean {
  return resolveGpsSatelliteBasemap() !== null;
}

export function gpsMapBasemapAttributionLabel(kind: GpsMapBasemapKind): string {
  if (kind === "satellite") {
    return (
      resolveGpsSatelliteBasemap()?.attribution ?? GPS_MAP_DEFAULT_SATELLITE_ATTRIBUTION
    );
  }
  return GPS_MAP_OSM_ATTRIBUTION;
}
