import { useTranslations } from "next-intl";
import type { VehicleCardDto } from "../../types/vehicle.types";
import { VehicleCard } from "../vehicle-card/vehicle-card";
import styles from "./vehicles-grid.module.css";

export interface VehiclesGridProps {
  vehicles: VehicleCardDto[];
  canManage: boolean;
  onOpen: (vehicle: VehicleCardDto) => void;
  onPrimaryAction: (vehicle: VehicleCardDto) => void;
  onEditRates: (vehicle: VehicleCardDto) => void;
  onDelete: (vehicle: VehicleCardDto) => void;
  onGps: (vehicle: VehicleCardDto) => void;
}

function splitFleetSections(vehicles: VehicleCardDto[]) {
  let split = 0;
  while (split < vehicles.length && vehicles[split]?.fleetAttentionTier != null) {
    split += 1;
  }
  return {
    priority: vehicles.slice(0, split),
    regular: vehicles.slice(split),
  };
}

export function VehiclesGrid({
  vehicles,
  canManage,
  onOpen,
  onPrimaryAction,
  onEditRates,
  onDelete,
  onGps,
}: VehiclesGridProps) {
  const t = useTranslations("Vehicles");
  const { priority, regular } = splitFleetSections(vehicles);

  const renderCards = (list: VehicleCardDto[]) =>
    list.map((vehicle) => (
      <VehicleCard
        key={vehicle.id}
        vehicle={vehicle}
        canManage={canManage}
        onOpen={onOpen}
        onPrimaryAction={onPrimaryAction}
        onEditRates={onEditRates}
        onDelete={onDelete}
        onGps={onGps}
      />
    ));

  return (
    <div data-testid="vehicles-grid">
      {priority.length > 0 ? (
        <section className={styles.prioritySection} aria-labelledby="fleet-priority-heading">
          <h3 id="fleet-priority-heading" className={styles.priorityHeading}>
            {t("prioritySection.title")}
          </h3>
          <div className={styles.grid}>{renderCards(priority)}</div>
        </section>
      ) : null}
      {priority.length > 0 && regular.length > 0 ? (
        <hr className={styles.sectionDivider} aria-hidden="true" />
      ) : null}
      {regular.length > 0 ? (
        <div className={styles.grid}>{renderCards(regular)}</div>
      ) : null}
      {priority.length > 0 && regular.length === 0 ? null : null}
      {vehicles.length === 0 ? <div className={styles.grid} /> : null}
    </div>
  );
}
