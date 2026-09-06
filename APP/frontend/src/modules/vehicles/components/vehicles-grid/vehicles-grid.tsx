import type { VehicleCardDto } from "../../types/vehicle.types";
import { VehicleCard } from "../vehicle-card/vehicle-card";
import styles from "./vehicles-grid.module.css";

export interface VehiclesGridProps {
  vehicles: VehicleCardDto[];
  onOpen: (vehicle: VehicleCardDto) => void;
  onSetPrice: (vehicle: VehicleCardDto) => void;
  onPrimaryAction: (vehicle: VehicleCardDto) => void;
  onGps: (vehicle: VehicleCardDto) => void;
  onMore: (vehicle: VehicleCardDto) => void;
}

export function VehiclesGrid({
  vehicles,
  onOpen,
  onSetPrice,
  onPrimaryAction,
  onGps,
  onMore,
}: VehiclesGridProps) {
  return (
    <div className={styles.grid} data-testid="vehicles-grid">
      {vehicles.map((vehicle) => (
        <VehicleCard
          key={vehicle.id}
          vehicle={vehicle}
          onOpen={onOpen}
          onSetPrice={onSetPrice}
          onPrimaryAction={onPrimaryAction}
          onGps={onGps}
          onMore={onMore}
        />
      ))}
    </div>
  );
}
