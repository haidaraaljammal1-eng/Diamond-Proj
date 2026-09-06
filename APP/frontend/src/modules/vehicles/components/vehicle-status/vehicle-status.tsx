import { useTranslations } from "next-intl";
import { Chip } from "@/shared/components/ui/chip";
import { getVehicleStatusPresentation } from "../../utils/vehicle-status";
import type { VehicleOperationalStatus } from "../../types/vehicle.types";

export interface VehicleStatusProps {
  status: VehicleOperationalStatus;
  /** Opaque surface — pass it whenever the chip sits on a vehicle photo. */
  solid?: boolean;
  className?: string;
}

export function VehicleStatus({ status, solid = false, className }: VehicleStatusProps) {
  const t = useTranslations("Vehicles");
  const presentation = getVehicleStatusPresentation(status);
  return (
    <Chip tone={presentation.tone} dot solid={solid} className={className}>
      {t(presentation.translationKey)}
    </Chip>
  );
}
