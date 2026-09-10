import { z } from "zod";
import { dateAndTimeToIso } from "../../utils/maintenance-datetime.ts";
import type {
  CreateMaintenancePayload,
  MaintenanceStartMode,
} from "../../types/maintenance.types";

function parseOptionalInt(
  value: string,
  options: { max?: number } = {},
): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) return Number.NaN;
  if (options.max !== undefined && parsed > options.max) return Number.NaN;
  return parsed;
}

export const addMaintenanceFormSchema = z
  .object({
    vehicleId: z.string().trim().min(1, { message: "required" }),
    issueDescription: z.string().trim().min(1, { message: "required" }),
    maintenanceType: z.enum([
      "mechanical",
      "electrical",
      "tires",
      "air_conditioning",
      "body",
      "periodic",
      "other",
    ]),
    startMode: z.enum(["now", "scheduled"]),
    scheduledDate: z.string(),
    scheduledTime: z.string(),
    workshopName: z.string(),
    odometerIn: z.string(),
    expectedDate: z.string(),
    expectedTime: z.string(),
    cost: z.string(),
    notes: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.issueDescription.length > 2000) {
      ctx.addIssue({
        code: "custom",
        message: "tooLong",
        path: ["issueDescription"],
      });
    }

    if (values.startMode === "scheduled") {
      if (!values.scheduledDate.trim() || !values.scheduledTime.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "scheduledRequired",
          path: ["scheduledDate"],
        });
      } else if (!dateAndTimeToIso(values.scheduledDate, values.scheduledTime)) {
        ctx.addIssue({
          code: "custom",
          message: "scheduledRequired",
          path: ["scheduledDate"],
        });
      }
    }

    if (values.workshopName.trim().length > 200) {
      ctx.addIssue({
        code: "custom",
        message: "tooLong",
        path: ["workshopName"],
      });
    }

    if (values.notes.trim().length > 2000) {
      ctx.addIssue({
        code: "custom",
        message: "tooLong",
        path: ["notes"],
      });
    }

    const odometer = parseOptionalInt(values.odometerIn, { max: 9_999_999 });
    if (values.odometerIn.trim() && Number.isNaN(odometer)) {
      ctx.addIssue({
        code: "custom",
        message: "invalidNonnegative",
        path: ["odometerIn"],
      });
    }

    const cost = parseOptionalInt(values.cost);
    if (values.cost.trim() && Number.isNaN(cost)) {
      ctx.addIssue({
        code: "custom",
        message: "invalidRate",
        path: ["cost"],
      });
    }

    if (
      values.expectedDate.trim() &&
      !dateAndTimeToIso(values.expectedDate, values.expectedTime)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "scheduledRequired",
        path: ["expectedDate"],
      });
    }
  });

export type AddMaintenanceFormValues = z.infer<typeof addMaintenanceFormSchema>;

export const EMPTY_ADD_MAINTENANCE_VALUES: AddMaintenanceFormValues = {
  vehicleId: "",
  issueDescription: "",
  maintenanceType: "mechanical",
  startMode: "now",
  scheduledDate: "",
  scheduledTime: "",
  workshopName: "",
  odometerIn: "",
  expectedDate: "",
  expectedTime: "",
  cost: "",
  notes: "",
};

export function toCreateMaintenancePayload(
  values: AddMaintenanceFormValues,
): CreateMaintenancePayload {
  const odometer = parseOptionalInt(values.odometerIn, { max: 9_999_999 });
  const cost = parseOptionalInt(values.cost);
  const startMode: MaintenanceStartMode = values.startMode;
  const scheduledAt =
    startMode === "scheduled"
      ? dateAndTimeToIso(values.scheduledDate, values.scheduledTime)
      : null;
  const expectedCompletionAt = dateAndTimeToIso(
    values.expectedDate,
    values.expectedTime,
  );

  return {
    vehicleId: Number(values.vehicleId),
    issueDescription: values.issueDescription.trim(),
    maintenanceType: values.maintenanceType,
    startMode,
    ...(scheduledAt ? { scheduledAt } : {}),
    ...(values.workshopName.trim()
      ? { workshopName: values.workshopName.trim() }
      : {}),
    ...(odometer !== undefined && !Number.isNaN(odometer)
      ? { odometerIn: odometer }
      : {}),
    ...(expectedCompletionAt ? { expectedCompletionAt } : {}),
    ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
    ...(cost !== undefined && !Number.isNaN(cost) ? { cost } : {}),
  };
}
