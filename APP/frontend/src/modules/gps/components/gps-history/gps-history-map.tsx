"use client";

import dynamic from "next/dynamic";
import type { GpsHistoryMapCanvasProps } from "./gps-history-map-canvas";
import styles from "./gps-history-map.module.css";

const GpsHistoryMapCanvas = dynamic(
  () =>
    import("./gps-history-map-canvas").then(
      (module) => module.GpsHistoryMapCanvas,
    ),
  {
    ssr: false,
    loading: () => <section className={styles.frame} aria-hidden="true" />,
  },
);

export function GpsHistoryMap(props: GpsHistoryMapCanvasProps) {
  return <GpsHistoryMapCanvas {...props} />;
}
