import { z } from "zod";
import { dateAndTimeToIso } from "../../utils/maintenance-datetime.ts";
import type { UpdateMaintenancePayload } from "../../types/maintenance.types";

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

export const editMaintenanceFormSchema = z
  .object({
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
    workshopName: z.string(),
    odometerIn: z.string(),
    expectedDate: z.string(),
    expectedTime: z.string(),
    cost: z.string(),
    notes: z.string(),
    scheduledDate: z.string(),
    scheduledTime: z.string(),
    allowScheduledAt: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.issueDescription.length > 2000) {
      ctx.addIssue({
        code: "custom",
        message: "tooLong",
        path: ["issueDescription"],
      });
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

    if (values.allowScheduledAt) {
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
  });

export type EditMaintenanceFormValues = z.infer<typeof editMaintenanceFormSchema>;

export function toUpdateMaintenancePayload(
  values: EditMaintenanceFormValues,
): UpdateMaintenancePayload {
  const odometer = parseOptionalInt(values.odometerIn, { max: 9_999_999 });
  const cost = parseOptionalInt(values.cost);
  const expectedCompletionAt = values.expectedDate.trim()
    ? dateAndTimeToIso(values.expectedDate, values.expectedTime)
    : null;
  const scheduledAt = values.allowScheduledAt
    ? dateAndTimeToIso(values.scheduledDate, values.scheduledTime)
    : null;

  return {
    issueDescription: values.issueDescription.trim(),
    maintenanceType: values.maintenanceType,
    workshopName: values.workshopName.trim() ? values.workshopName.trim() : null,
    odometerIn:
      odometer !== undefined && !Number.isNaN(odometer) ? odometer : null,
    expectedCompletionAt,
    notes: values.notes.trim() ? values.notes.trim() : null,
    ...(cost !== undefined && !Number.isNaN(cost) ? { cost } : {}),
    ...(scheduledAt ? { scheduledAt } : {}),
  };
}
