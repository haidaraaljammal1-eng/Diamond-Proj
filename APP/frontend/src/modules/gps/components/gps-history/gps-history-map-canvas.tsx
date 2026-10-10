"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GpsHistoryPointDto } from "../../types/gps.types";
import { clampPlaybackIndex } from "../../utils/gps-history";
import { DUBAI_DEFAULT_CENTER, DUBAI_DEFAULT_ZOOM } from "../../utils/gps-map";
import styles from "./gps-history-map.module.css";

export interface GpsHistoryMapCanvasProps {
  points: GpsHistoryPointDto[];
  activeIndex: number;
  labels: {
    start: string;
    end: string;
    active: string;
  };
}

function historyIcon(kind: "start" | "end" | "active", text: string) {
  return L.divIcon({
    className: "",
    html: `<span class="gps-history-marker gps-history-marker--${kind}" aria-hidden="true">${text}</span>`,
    iconSize: kind === "active" ? [30, 30] : [26, 26],
    iconAnchor: kind === "active" ? [15, 15] : [13, 13],
  });
}

export function GpsHistoryMapCanvas({
  points,
  activeIndex,
  labels,
}: GpsHistoryMapCanvasProps) {
  const frameRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const activeMarkerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    const host = hostRef.current;
    if (!frame || !host) return;

    const map = L.map(host, {
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: true,
    }).setView(
      [DUBAI_DEFAULT_CENTER.latitude, DUBAI_DEFAULT_CENTER.longitude],
      DUBAI_DEFAULT_ZOOM,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    let raf = 0;
    const resize = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        map.invalidateSize({ animate: false });
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(frame);
    resize();

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
      activeMarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = routeLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    activeMarkerRef.current = null;

    if (points.length === 0) {
      map.setView(
        [DUBAI_DEFAULT_CENTER.latitude, DUBAI_DEFAULT_CENTER.longitude],
        DUBAI_DEFAULT_ZOOM,
      );
      return;
    }

    const latLngs = points.map(
      (point) => [point.latitude, point.longitude] as L.LatLngTuple,
    );
    L.polyline(latLngs, {
      color: "#9a6f28",
      weight: 4,
      opacity: 0.86,
      lineJoin: "round",
    }).addTo(layer);

    const first = latLngs[0]!;
    const last = latLngs.at(-1)!;
    L.marker(first, {
      icon: historyIcon("start", "S"),
      title: labels.start,
      keyboard: true,
    }).addTo(layer);
    L.marker(last, {
      icon: historyIcon("end", "E"),
      title: labels.end,
      keyboard: true,
    }).addTo(layer);

    activeMarkerRef.current = L.marker(first, {
      icon: historyIcon("active", "●"),
      title: labels.active,
      keyboard: true,
      zIndexOffset: 500,
    }).addTo(layer);

    const bounds = L.latLngBounds(latLngs);
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
    }
  }, [labels.active, labels.end, labels.start, points]);

  useEffect(() => {
    const point = points[clampPlaybackIndex(activeIndex, points.length)];
    if (!point || !activeMarkerRef.current) return;
    activeMarkerRef.current.setLatLng([point.latitude, point.longitude]);
  }, [activeIndex, points]);

  return (
    <section ref={frameRef} className={styles.frame} data-testid="gps-history-map">
      <div ref={hostRef} className={styles.canvas} dir="ltr" />
      <p className={styles.attribution} dir="ltr">
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          © OpenStreetMap
        </a>
      </p>
    </section>
  );
}
