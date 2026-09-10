"use client";

import dynamic from "next/dynamic";
import type { GpsMapCanvasProps } from "./gps-map-canvas";
import styles from "./gps-map.module.css";

const GpsMapCanvas = dynamic(
  () => import("./gps-map-canvas").then((module) => module.GpsMapCanvas),
  {
    ssr: false,
    loading: () => (
      <section className={styles.frame} data-testid="gps-map-loading">
        <div className={styles.skeleton} />
      </section>
    ),
  },
);

export function GpsMap(props: GpsMapCanvasProps) {
  return <GpsMapCanvas {...props} />;
}
