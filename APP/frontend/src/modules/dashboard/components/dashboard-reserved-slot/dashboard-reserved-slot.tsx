"use client";

import Image from "next/image";
import { Card } from "@/shared/components/ui/card";
import styles from "./dashboard-reserved-slot.module.css";

/** Bump `v` when replacing the top banner asset so Next/Image cache refreshes. */
const OWNER_FEATURE_IMAGE_TOP =
  "/dashboard/owner-feature-panel-top.png?v=2026101702";
const OWNER_FEATURE_IMAGE_BOTTOM =
  "/dashboard/owner-feature-panel-bottom.png?v=2026101703";

export function DashboardReservedSlot() {
  return (
    <Card as="section" className={styles.card} padding="none" aria-hidden="true">
      <div className={styles.stack}>
        <div className={styles.frameTop}>
          <Image
            src={OWNER_FEATURE_IMAGE_TOP}
            alt=""
            fill
            priority
            unoptimized
            sizes="(max-width: 1080px) 100vw, 65vw"
            className={styles.image}
          />
        </div>
        <div className={styles.frameBottom}>
          <Image
            src={OWNER_FEATURE_IMAGE_BOTTOM}
            alt=""
            fill
            unoptimized
            sizes="(max-width: 1080px) 100vw, 65vw"
            className={styles.image}
          />
        </div>
      </div>
    </Card>
  );
}
