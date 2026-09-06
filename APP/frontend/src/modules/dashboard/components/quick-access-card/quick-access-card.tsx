"use client";

import { useTranslations } from "next-intl";
import { ActionTile } from "@/shared/components/ui/action-tile";
import { Card } from "@/shared/components/ui/card";
import { NAVIGATION_ICONS } from "@/modules/navigation";
import { QuickAccessIcon } from "../../dashboard.icons";
import styles from "./quick-access-card.module.css";

export interface QuickAccessCardProps {
  contractsTotal: number;
  fleetRented: number;
  vehiclesInService: number;
  unreadMessages: number;
  /** The contracts shortcut is an owner-only entry in the Demo. */
  isOwner: boolean;
}

/**
 * Demo Dashboard "وصول سريع" card.
 *
 * Every target page is still unbuilt, so each tile renders as a disabled
 * placeholder carrying the shell's "coming later" note — the same rule the
 * rail's own action items follow.
 */
export function QuickAccessCard({
  contractsTotal,
  fleetRented,
  vehiclesInService,
  unreadMessages,
  isOwner,
}: QuickAccessCardProps) {
  const t = useTranslations("Dashboard");
  const nav = useTranslations("navigation");
  const shell = useTranslations("Shell");
  const hint = shell("navigationActionNote");

  const CarsIcon = NAVIGATION_ICONS.cars;
  const ContractsIcon = NAVIGATION_ICONS.contracts;
  const GpsIcon = NAVIGATION_ICONS.gps;
  const MaintenanceIcon = NAVIGATION_ICONS.maintenance;
  const ChatsIcon = NAVIGATION_ICONS.chats;

  return (
    <Card as="section" className={styles.card}>
      <Card.Title icon={<QuickAccessIcon />}>{t("quickAccess")}</Card.Title>

      <div className={styles.grid}>
        <ActionTile
          disabled
          hint={hint}
          icon={<CarsIcon />}
          title={nav("cars")}
          meta={t("quick.carsMeta")}
        />

        {isOwner ? (
          <ActionTile
            disabled
            hint={hint}
            icon={<ContractsIcon />}
            title={nav("contracts")}
            meta={t("quick.contractsMeta", { count: contractsTotal })}
          />
        ) : null}

        <ActionTile
          disabled
          hint={hint}
          icon={<GpsIcon />}
          title={nav("gps")}
          meta={t("quick.gpsMeta", { count: fleetRented })}
        />

        <ActionTile
          disabled
          hint={hint}
          icon={<MaintenanceIcon />}
          title={nav("maintenance")}
          meta={t("quick.maintenanceMeta", { count: vehiclesInService })}
        />

        <ActionTile
          disabled
          hint={hint}
          icon={<ChatsIcon />}
          title={nav("chats")}
          meta={
            unreadMessages > 0
              ? t("quick.messagesUnread", { count: unreadMessages })
              : t("quick.messagesEmpty")
          }
          badge={unreadMessages}
        />
      </div>
    </Card>
  );
}
