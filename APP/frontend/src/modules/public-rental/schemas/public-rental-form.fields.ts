import type { FormField } from "@/shared/components/forms/form-builder";
import type { PublicRentalFormValues } from "../schemas/public-rental-form.schema";

export function publicRentalFormFields(
  t: (key: string) => string,
): FormField<PublicRentalFormValues>[] {
  return [
    { type: "text", name: "name", placeholder: t("fields.name"), autoComplete: "name" },
    {
      type: "text",
      name: "mobile",
      placeholder: t("fields.mobile"),
      autoComplete: "tel",
      colSpan: 1,
    },
    {
      type: "email",
      name: "email",
      placeholder: t("fields.email"),
      autoComplete: "email",
      colSpan: 1,
    },
    {
      type: "text",
      name: "nationality",
      placeholder: t("fields.nationality"),
      autoComplete: "country-name",
    },
    {
      type: "text",
      name: "identityNumber",
      placeholder: t("fields.identityNumber"),
      colSpan: 1,
    },
    {
      type: "text",
      name: "passportNumber",
      placeholder: t("fields.passportNumber"),
      colSpan: 1,
    },
    { type: "text", name: "address", placeholder: t("fields.address"), autoComplete: "street-address" },
  ];
}
