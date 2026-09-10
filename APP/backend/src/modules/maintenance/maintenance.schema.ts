import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";
import { VehicleOperationalStatusDtoSchema } from "src/modules/vehicles/vehicles.schema";

export const MaintenanceStatusDtoSchema = z.enum([
  "scheduled",
  "in_service",
  "ready_for_pickup",
  "completed",
  "cancelled",
]);
export type MaintenanceStatusDto = z.infer<typeof MaintenanceStatusDtoSchema>;

export const MaintenanceTypeDtoSchema = z.enum([
  "mechanical",
  "electrical",
  "tires",
  "air_conditioning",
  "body",
  "periodic",
  "other",
]);
export type MaintenanceTypeDto = z.infer<typeof MaintenanceTypeDtoSchema>;

export const MaintenanceStartModeSchema = z.enum(["now", "scheduled"]);

const IssueDescription = z.string().trim().min(1).max(2000);
const WorkshopName = z.string().trim().min(1).max(200);
const Notes = z.string().trim().min(1).max(2000);
const OdometerIn = z.number().int().nonnegative().max(9_999_999);
/** Actual known maintenance cost in whole AED. */
const Cost = z.number().int().nonnegative();

export const MaintenanceVehicleSchema = z.object({
  id: z.number().int(),
  vehicleName: z.string().nullable(),
  displayName: z.string(),
  plateNumber: z.string().nullable(),
  modelYear: z.number().int().nullable(),
  color: z.string().nullable(),
  operationalStatus: VehicleOperationalStatusDtoSchema,
  primaryImageUrl: z.string().nullable(),
});

export const MaintenanceOrderSchema = z.object({
  id: z.number().int(),
  vehicleId: z.number().int(),
  status: MaintenanceStatusDtoSchema,
  maintenanceType: MaintenanceTypeDtoSchema,
  issueDescription: z.string(),
  scheduledAt: z.date().nullable(),
  startedAt: z.date().nullable(),
  readyAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  workshopName: z.string().nullable(),
  odometerIn: z.number().int().nullable(),
  expectedCompletionAt: z.date().nullable(),
  notes: z.string().nullable(),
  cost: z.number().int().nullable(),
  overdue: z.boolean(),
  createdByUserId: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
  /** Embedded Vehicle projection — list and detail share this join, no N+1. */
  vehicle: MaintenanceVehicleSchema,
});
export type MaintenanceOrderDto = z.infer<typeof MaintenanceOrderSchema>;

export const MaintenanceOrderDetailSchema = MaintenanceOrderSchema;
export type MaintenanceOrderDetailDto = MaintenanceOrderDto;

export const ListMaintenanceQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  status: z
    .enum([
      "all",
      "scheduled",
      "in_service",
      "ready_for_pickup",
      "completed",
      "cancelled",
      "overdue",
    ])
    .optional()
    .default("all"),
  vehicleId: z.coerce.number().int().positive().optional(),
  maintenanceType: MaintenanceTypeDtoSchema.optional(),
  sort: z.string().optional(),
});

export const CreateMaintenanceSchema = z
  .object({
    vehicleId: z.number().int().positive(),
    issueDescription: IssueDescription,
    maintenanceType: MaintenanceTypeDtoSchema,
    startMode: MaintenanceStartModeSchema,
    scheduledAt: z.coerce.date().optional(),
    workshopName: WorkshopName.optional(),
    odometerIn: OdometerIn.optional(),
    expectedCompletionAt: z.coerce.date().optional(),
    notes: Notes.optional(),
    cost: Cost.optional(),
  })
  .superRefine((body, ctx) => {
    if (body.startMode === "scheduled" && !body.scheduledAt) {
      ctx.addIssue({
        code: "custom",
        path: ["scheduledAt"],
        message: "scheduledAt is required when startMode is scheduled",
      });
    }
  });

export const UpdateMaintenanceSchema = z
  .object({
    issueDescription: IssueDescription.optional(),
    maintenanceType: MaintenanceTypeDtoSchema.optional(),
    workshopName: WorkshopName.nullable().optional(),
    odometerIn: OdometerIn.nullable().optional(),
    expectedCompletionAt: z.coerce.date().nullable().optional(),
    notes: Notes.nullable().optional(),
    cost: Cost.nullable().optional(),
    scheduledAt: z.coerce.date().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field is required",
  });

export const MaintenanceSummarySchema = z.object({
  inService: z.number().int(),
  scheduled: z.number().int(),
  readyForPickup: z.number().int(),
  overdue: z.number().int(),
  completedThisMonth: z.number().int(),
  totalCost: z.number().int(),
});
export type MaintenanceSummaryDto = z.infer<typeof MaintenanceSummarySchema>;
