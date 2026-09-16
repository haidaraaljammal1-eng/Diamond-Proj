"use client";

import type { MaintenanceOrderDetailDto } from "../../types/maintenance.types";
import { MaintenanceCard } from "../maintenance-card/maintenance-card";
import styles from "./maintenance-grid.module.css";

export interface MaintenanceGridProps {
  items: MaintenanceOrderDetailDto[];
  canManage: boolean;
  onOpen: (order: MaintenanceOrderDetailDto) => void;
  onEdit: (order: MaintenanceOrderDetailDto) => void;
  onComplete: (order: MaintenanceOrderDetailDto) => void;
  onCancel: (order: MaintenanceOrderDetailDto) => void;
}

export function MaintenanceGrid({
  items,
  canManage,
  onOpen,
  onEdit,
  onComplete,
  onCancel,
}: MaintenanceGridProps) {
  return (
    <div className={styles.grid} id="maintcards" data-testid="maintenance-grid">
      {items.map((order) => (
        <MaintenanceCard
          key={order.id}
          order={order}
          canManage={canManage}
          onOpen={onOpen}
          onEdit={onEdit}
          onComplete={onComplete}
          onCancel={onCancel}
        />
      ))}
    </div>
  );
}
