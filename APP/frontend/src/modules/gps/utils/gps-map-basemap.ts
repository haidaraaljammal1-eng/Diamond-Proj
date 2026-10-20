import L from "leaflet";
import {
  GPS_MAP_OSM_ATTRIBUTION,
  GPS_MAP_OSM_TILE_REFERRER_POLICY,
  GPS_MAP_OSM_TILE_URL,
  type GpsMapBasemapKind,
  resolveGpsSatelliteBasemap,
} from "./gps-map-basemap-config";

export type { GpsMapBasemapKind } from "./gps-map-basemap-config";
export {
  GPS_MAP_DEFAULT_SATELLITE_ATTRIBUTION,
  GPS_MAP_DEFAULT_SATELLITE_TILE_URL,
  GPS_MAP_OSM_ATTRIBUTION,
  GPS_MAP_OSM_TILE_REFERRER_POLICY,
  GPS_MAP_OSM_TILE_URL,
  gpsMapBasemapAttributionLabel,
  isGpsSatelliteBasemapEnabled,
  resolveGpsSatelliteBasemap,
} from "./gps-map-basemap-config";

function createOsmTileLayer(): L.TileLayer {
  return L.tileLayer(GPS_MAP_OSM_TILE_URL, {
    maxZoom: 19,
    attribution: GPS_MAP_OSM_ATTRIBUTION,
    referrerPolicy: GPS_MAP_OSM_TILE_REFERRER_POLICY,
  });
}

export function createGpsBasemapTileLayer(kind: GpsMapBasemapKind): L.TileLayer {
  if (kind === "satellite") {
    const satellite = resolveGpsSatelliteBasemap();
    if (!satellite) {
      return createOsmTileLayer();
    }
    return L.tileLayer(satellite.url, {
      maxZoom: 19,
      maxNativeZoom: 19,
      attribution: satellite.attribution,
    });
  }
  return createOsmTileLayer();
}
