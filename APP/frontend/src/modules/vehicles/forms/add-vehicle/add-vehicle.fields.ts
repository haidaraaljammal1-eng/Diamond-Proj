import type { FormField } from "@/shared/components/forms/form-builder";
import type { AddVehicleFormValues } from "./add-vehicle.schema";
import type { SelectOption } from "@/shared/components/ui/select";

export interface AddVehicleFieldLabels {
  company: string;
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
  companyOptions: readonly SelectOption[],
  companiesLoading = false,
): FormField<AddVehicleFormValues>[] {
  return [
    {
      type: "select",
      name: "companyId",
      options: companyOptions,
      placeholder: labels.company,
      disabled: companiesLoading,
      colSpan: 2,
    },
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
