import { useTranslations } from "next-intl";
import { Chip } from "@/shared/components/ui/chip";
import { getVehicleStatusPresentation } from "../../utils/vehicle-status";
import type { VehicleCurrentRentalStatus, VehicleOperationalStatus } from "../../types/vehicle.types";

export interface VehicleStatusProps {
  status: VehicleOperationalStatus;
  currentRentalStatus?: VehicleCurrentRentalStatus | null;
  /** Opaque surface — pass it whenever the chip sits on a vehicle photo. */
  solid?: boolean;
  className?: string;
}

export function VehicleStatus({
  status,
  currentRentalStatus = null,
  solid = false,
  className,
}: VehicleStatusProps) {
  const t = useTranslations("Vehicles");
  const presentation = getVehicleStatusPresentation(status, currentRentalStatus);
  return (
    <Chip tone={presentation.tone} dot solid={solid} className={className}>
      {t(presentation.translationKey)}
    </Chip>
  );
}
