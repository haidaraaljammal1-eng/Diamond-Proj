"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTranslations } from "next-intl";
import type { GpsMapPointDto, GpsTrackingStatus } from "../../types/gps.types";
import { Icon } from "@/shared/components/ui/icon";
import {
  DUBAI_DEFAULT_CENTER,
  DUBAI_DEFAULT_ZOOM,
  GPS_MAP_FOCUS_FLY_DURATION_S,
  GPS_MAP_FOCUS_MIN_ZOOM,
  boundsFromMarkers,
  markerAnimationDurationMs,
  markerModifier,
  interpolateCoordinate,
  projectMapMarkers,
  shouldSnapMarker,
  shouldInvalidateLeafletSize,
} from "../../utils/gps-map";
import {
  createGpsBasemapTileLayer,
  gpsMapBasemapAttributionLabel,
  isGpsSatelliteBasemapEnabled,
  type GpsMapBasemapKind,
} from "../../utils/gps-map-basemap";
import styles from "./gps-map.module.css";

export interface GpsMapCanvasProps {
  points: GpsMapPointDto[];
  selectedVehicleId: number | null;
  focusedMapVehicleId: number | null;
  focusToken: number;
  loading: boolean;
  error: string | null;
  empty: boolean;
  onSelect: (vehicleId: number) => void;
  onClearMapFocus: () => void;
  onRetry: () => void;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

function markerHtml(
  status: GpsTrackingStatus,
  selected: boolean,
  headingDegrees: number | null,
  label: string,
  vehicleId: number,
): string {
  const heading =
    typeof headingDegrees === "number"
      ? `<span class="gps-heading" style="transform:rotate(${headingDegrees}deg)"></span>`
      : "";
  return `<span class="gps-pin gps-pin--${markerModifier(status)}${selected ? " is-selected" : ""}" data-testid="gps-marker" data-vehicle-id="${vehicleId}" role="img" aria-label="${escapeHtml(label)}" onclick="window.dispatchEvent(new CustomEvent('diamond-gps-select',{detail:${vehicleId}}))">${heading}</span>`;
}

export function GpsMapCanvas({
  points,
  selectedVehicleId,
  focusedMapVehicleId,
  focusToken,
  loading,
  error,
  empty,
  onSelect,
  onClearMapFocus,
  onRetry,
}: GpsMapCanvasProps) {
  const t = useTranslations("Gps");
  const frameRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseTileRef = useRef<L.TileLayer | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());
  const markerCapturedAtRef = useRef<Map<number, string>>(new Map());
  const animationFramesRef = useRef<Map<number, number>>(new Map());
  const onSelectRef = useRef(onSelect);
  const mapEpochRef = useRef(0);
  const [mapEpoch, setMapEpoch] = useState(0);
  const [basemapKind, setBasemapKind] = useState<GpsMapBasemapKind>("map");
  const basemapAppliedRef = useRef<GpsMapBasemapKind | null>(null);
  const satelliteBasemapEnabled = isGpsSatelliteBasemapEnabled();

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const onPin = (event: Event) => {
      const id = (event as CustomEvent<number>).detail;
      if (typeof id === "number") onSelectRef.current(id);
    };
    window.addEventListener("diamond-gps-select", onPin);
    return () => window.removeEventListener("diamond-gps-select", onPin);
  }, []);

  const markers = useMemo(() => projectMapMarkers(points), [points]);
  const fittedCountRef = useRef(0);
  const lastBoxRef = useRef({ width: 0, height: 0 });

  const cancelMarkerAnimation = (vehicleId: number) => {
    const frame = animationFramesRef.current.get(vehicleId);
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    animationFramesRef.current.delete(vehicleId);
  };

  const cancelAllMarkerAnimations = () => {
    for (const vehicleId of animationFramesRef.current.keys()) {
      cancelMarkerAnimation(vehicleId);
    }
  };

  const updateMarkerPosition = (
    vehicleId: number,
    marker: L.Marker,
    latitude: number,
    longitude: number,
    capturedAt: string,
  ) => {
    const previousCapturedAt = markerCapturedAtRef.current.get(vehicleId) ?? null;
    const target = { latitude, longitude };
    const current = marker.getLatLng();
    if (
      previousCapturedAt &&
      new Date(capturedAt).getTime() <= new Date(previousCapturedAt).getTime()
    ) {
      return;
    }
    cancelMarkerAnimation(vehicleId);

    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      shouldSnapMarker(
        { latitude: current.lat, longitude: current.lng },
        target,
        previousCapturedAt,
        capturedAt,
      )
    ) {
      marker.setLatLng([latitude, longitude]);
      markerCapturedAtRef.current.set(vehicleId, capturedAt);
      return;
    }

    const duration = markerAnimationDurationMs(previousCapturedAt ?? capturedAt, capturedAt);
    const startedAt = performance.now();
    const start = { latitude: current.lat, longitude: current.lng };
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const position = interpolateCoordinate(start, target, progress);
      marker.setLatLng([position.latitude, position.longitude]);
      if (progress < 1) {
        animationFramesRef.current.set(vehicleId, window.requestAnimationFrame(step));
      } else {
        animationFramesRef.current.delete(vehicleId);
      }
    };
    animationFramesRef.current.set(vehicleId, window.requestAnimationFrame(step));
    markerCapturedAtRef.current.set(vehicleId, capturedAt);
  };

  useEffect(() => {
    const frame = frameRef.current;
    const host = hostRef.current;
    if (!frame || !host) return;

    const pins = markersRef.current;
    let raf = 0;
    let afterCreate = 0;

    const createMap = () => {
      if (mapRef.current) return;
      if (host.clientWidth < 1 || host.clientHeight < 1) return;
      const map = L.map(host, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: true,
        // Prevent .leaflet-container focus from scrolling nested #app-main on pointer use.
        keyboard: false,
      }).setView(
        [DUBAI_DEFAULT_CENTER.latitude, DUBAI_DEFAULT_CENTER.longitude],
        DUBAI_DEFAULT_ZOOM,
      );
      const initialBase = createGpsBasemapTileLayer("map");
      initialBase.addTo(map);
      baseTileRef.current = initialBase;
      basemapAppliedRef.current = "map";
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      lastBoxRef.current = { width: host.clientWidth, height: host.clientHeight };
      mapEpochRef.current += 1;
      setMapEpoch(mapEpochRef.current);
      const refresh = () => {
        if (mapRef.current !== map) return;
        const next = { width: host.clientWidth, height: host.clientHeight };
        lastBoxRef.current = next;
        map.invalidateSize({ animate: false });
      };
      map.whenReady(refresh);
      afterCreate = window.requestAnimationFrame(() => {
        afterCreate = 0;
        refresh();
      });
    };

    const syncSize = () => {
      raf = 0;
      const next = { width: host.clientWidth, height: host.clientHeight };
      if (!mapRef.current) {
        createMap();
        return;
      }
      if (!shouldInvalidateLeafletSize(lastBoxRef.current, next)) return;
      lastBoxRef.current = next;
      mapRef.current.invalidateSize({ animate: false });
    };

    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(syncSize);
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(frame);
    schedule();

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      if (afterCreate) window.cancelAnimationFrame(afterCreate);
      observer.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      baseTileRef.current = null;
      layerRef.current = null;
      cancelAllMarkerAnimations();
      pins.clear();
      markerCapturedAtRef.current.clear();
      animationFramesRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const previousBase = baseTileRef.current;
    if (!map || !previousBase) return;
    if (basemapAppliedRef.current === basemapKind) return;
    const center = map.getCenter();
    const zoom = map.getZoom();
    const nextBase = createGpsBasemapTileLayer(basemapKind);
    nextBase.addTo(map);
    nextBase.bringToBack();
    map.removeLayer(previousBase);
    baseTileRef.current = nextBase;
    basemapAppliedRef.current = basemapKind;
    map.setView(center, zoom, { animate: false });
  }, [basemapKind]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    const nextIds = new Set(markers.map((marker) => marker.vehicleId));
    for (const [vehicleId, marker] of markersRef.current) {
      if (nextIds.has(vehicleId)) continue;
      cancelMarkerAnimation(vehicleId);
      marker.remove();
      markersRef.current.delete(vehicleId);
      markerCapturedAtRef.current.delete(vehicleId);
    }
    for (const marker of markers) {
      const existing = markersRef.current.get(marker.vehicleId);
      if (existing) {
        existing.setIcon(
          L.divIcon({
            className: "gps-divicon",
            html: markerHtml(
              marker.trackingStatus,
              marker.vehicleId === selectedVehicleId,
              marker.headingDegrees,
              marker.label,
              marker.vehicleId,
            ),
            iconSize: [28, 36],
            iconAnchor: [14, 34],
          }),
        );
        updateMarkerPosition(
          marker.vehicleId,
          existing,
          marker.latitude,
          marker.longitude,
          marker.capturedAt,
        );
        continue;
      }
      const selected = marker.vehicleId === selectedVehicleId;
      const pin = L.marker([marker.latitude, marker.longitude], {
        icon: L.divIcon({
          className: "gps-divicon",
          html: markerHtml(
            marker.trackingStatus,
            selected,
            marker.headingDegrees,
            marker.label,
            marker.vehicleId,
          ),
          iconSize: [28, 36],
          iconAnchor: [14, 34],
        }),
        keyboard: true,
        title: marker.label,
        riseOnHover: true,
      });
      const select = () => onSelectRef.current(marker.vehicleId);
      pin.on("click", select);
      pin.addTo(layer);
      pin.getElement()?.addEventListener("click", (event) => {
        event.stopPropagation();
        select();
      });
      markersRef.current.set(marker.vehicleId, pin);
      markerCapturedAtRef.current.set(marker.vehicleId, marker.capturedAt);
    }
    if (markers.length > 0 && fittedCountRef.current === 0) {
      const bounds = boundsFromMarkers(markers);
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [36, 36], maxZoom: 13 });
      }
    }
    fittedCountRef.current = markers.length;
  }, [markers, selectedVehicleId, mapEpoch]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || focusedMapVehicleId == null) return;
    const marker = markersRef.current.get(focusedMapVehicleId);
    if (!marker) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), GPS_MAP_FOCUS_MIN_ZOOM), {
      duration: reduced ? 0 : GPS_MAP_FOCUS_FLY_DURATION_S,
    });
  }, [focusedMapVehicleId, focusToken]);

  function fitVehicles() {
    const map = mapRef.current;
    if (!map) return;
    const bounds = boundsFromMarkers(markers);
    if (bounds.length === 0) {
      map.setView(
        [DUBAI_DEFAULT_CENTER.latitude, DUBAI_DEFAULT_CENTER.longitude],
        DUBAI_DEFAULT_ZOOM,
      );
      return;
    }
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
  }

  function recenterSelected() {
    const map = mapRef.current;
    if (!map || selectedVehicleId == null) return;
    const marker = markersRef.current.get(selectedVehicleId);
    if (!marker) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 15), {
      duration: reduced ? 0 : 0.45,
    });
  }

  function zoomBy(delta: number) {
    mapRef.current?.setZoom((mapRef.current.getZoom() ?? DUBAI_DEFAULT_ZOOM) + delta);
  }

  function toggleBasemap() {
    setBasemapKind((kind) => (kind === "map" ? "satellite" : "map"));
  }

  return (
    <section ref={frameRef} className={styles.frame} data-testid="gps-map">
      {loading ? <div className={styles.skeleton} aria-hidden="true" /> : null}
      <div ref={hostRef} className={styles.canvas} dir="ltr" />
      {focusedMapVehicleId != null ? (
        <button
          type="button"
          className={styles.showAll}
          data-testid="gps-map-show-all"
          onClick={onClearMapFocus}
        >
          <Icon name="mdi:map-marker-multiple" size={16} aria-hidden />
          <span>{t("map.showAllVehicles")}</span>
        </button>
      ) : null}
      <div className={styles.controls} dir="ltr">
        <button type="button" className={styles.control} onClick={() => zoomBy(1)} aria-label={t("map.zoomIn")}>
          +
        </button>
        <button type="button" className={styles.control} onClick={() => zoomBy(-1)} aria-label={t("map.zoomOut")}>
          −
        </button>
        <button type="button" className={styles.controlWide} onClick={fitVehicles}>
          {t("map.fit")}
        </button>
        <button
          type="button"
          className={styles.controlWide}
          onClick={recenterSelected}
          disabled={selectedVehicleId == null}
        >
          {t("map.recenter")}
        </button>
        {satelliteBasemapEnabled ? (
          <button
            type="button"
            className={[
              styles.controlWide,
              styles.controlBasemap,
              basemapKind === "satellite" ? styles.controlBasemapActive : "",
            ].join(" ")}
            data-testid="gps-map-basemap-toggle"
            aria-label={t("map.basemapLabel")}
            aria-pressed={basemapKind === "satellite"}
            onClick={toggleBasemap}
          >
            <Icon
              name={basemapKind === "map" ? "mdi:satellite-variant" : "mdi:map-outline"}
              size={14}
              aria-hidden
            />
            <span>
              {basemapKind === "map" ? t("map.basemapSatellite") : t("map.basemapMap")}
            </span>
          </button>
        ) : null}
      </div>
      {empty && !loading ? (
        <div className={styles.empty} data-testid="gps-map-empty">
          <p>{t("map.empty")}</p>
        </div>
      ) : null}
      {error ? (
        <div className={styles.empty} role="status">
          <p>{error}</p>
          <button type="button" className={styles.retry} onClick={onRetry}>
            {t("retry")}
          </button>
        </div>
      ) : null}
      <p className={styles.attribution} dir="ltr" data-testid="gps-map-attribution">
        {basemapKind === "map" ? (
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            © {gpsMapBasemapAttributionLabel("map")}
          </a>
        ) : (
          <>
            ©{" "}
            <a href="https://www.esri.com/" target="_blank" rel="noreferrer">
              {gpsMapBasemapAttributionLabel("satellite")}
            </a>
          </>
        )}
      </p>
    </section>
  );
}
