import { useTranslations } from "next-intl";
import { Chip } from "@/shared/components/ui/chip";
import { getVehicleStatusPresentation } from "../../utils/vehicle-status";
import type { VehicleOperationalStatus } from "../../types/vehicle.types";

export interface VehicleStatusProps {
  status: VehicleOperationalStatus;
  className?: string;
}

export function VehicleStatus({ status, className }: VehicleStatusProps) {
  const t = useTranslations("Vehicles");
  const presentation = getVehicleStatusPresentation(status);
  return (
    <Chip tone={presentation.tone} dot className={className}>
      {t(presentation.translationKey)}
    </Chip>
  );
}
