"use client";

import Image from "next/image";
import { Card } from "@/shared/components/ui/card";
import styles from "./dashboard-reserved-slot.module.css";

/** Owner feature panel — static asset, former Latest Contracts column. */
const OWNER_FEATURE_IMAGE = "/dashboard/owner-feature-panel.png";

export function DashboardReservedSlot() {
  return (
    <Card as="section" className={styles.card} padding="none" aria-hidden="true">
      <div className={styles.shell}>
        <Image
          src={OWNER_FEATURE_IMAGE}
          alt=""
          fill
          priority
          sizes="(max-width: 1080px) 100vw, 65vw"
          className={styles.image}
        />
      </div>
    </Card>
  );
}
