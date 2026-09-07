import type { FormField } from "@/shared/components/forms/form-builder";
import type { AddVehicleFormValues } from "./add-vehicle.schema";

export interface AddVehicleFieldLabels {
  vehicleName: string;
  vehicleNamePlaceholder: string;
  modelYear: string;
  plateNumber: string;
  color: string;
  dailyRate: string;
  monthlyRate: string;
  vin: string;
}

export function addVehicleFields(
  labels: AddVehicleFieldLabels,
): FormField<AddVehicleFormValues>[] {
  return [
    {
      type: "text",
      name: "vehicleName",
      placeholder: labels.vehicleName,
      colSpan: 2,
    },
    {
      type: "text",
      name: "modelYear",
      placeholder: labels.modelYear,
      colSpan: 1,
    },
    {
      type: "text",
      name: "plateNumber",
      placeholder: labels.plateNumber,
      colSpan: 1,
    },
    {
      type: "text",
      name: "color",
      placeholder: labels.color,
      colSpan: 1,
    },
    {
      type: "text",
      name: "dailyRate",
      placeholder: labels.dailyRate,
      colSpan: 1,
    },
    {
      type: "text",
      name: "monthlyRate",
      placeholder: labels.monthlyRate,
      colSpan: 1,
    },
    {
      type: "text",
      name: "vin",
      placeholder: labels.vin,
      colSpan: 2,
    },
  ];
}
