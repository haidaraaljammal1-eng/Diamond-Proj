import type { VehicleCardDto } from "../../types/vehicle.types";
import type { VehicleFleetPermissions } from "../../utils/vehicle-card-actions";
import { VehicleCard } from "../vehicle-card/vehicle-card";
import styles from "./vehicles-grid.module.css";

export interface VehiclesGridProps {
  vehicles: VehicleCardDto[];
  fleetPermissions: VehicleFleetPermissions;
  onOpen: (vehicle: VehicleCardDto) => void;
  onPrimaryAction: (vehicle: VehicleCardDto) => void;
  onEditRates: (vehicle: VehicleCardDto) => void;
  onDelete: (vehicle: VehicleCardDto) => void;
  onGps: (vehicle: VehicleCardDto) => void;
}

export function VehiclesGrid({
  vehicles,
  fleetPermissions,
  onOpen,
  onPrimaryAction,
  onEditRates,
  onDelete,
  onGps,
}: VehiclesGridProps) {
  return (
    <div className={styles.grid} data-testid="vehicles-grid">
      {vehicles.map((vehicle) => (
        <VehicleCard
          key={vehicle.id}
          vehicle={vehicle}
          fleetPermissions={fleetPermissions}
          onOpen={onOpen}
          onPrimaryAction={onPrimaryAction}
          onEditRates={onEditRates}
          onDelete={onDelete}
          onGps={onGps}
        />
      ))}
    </div>
  );
}
