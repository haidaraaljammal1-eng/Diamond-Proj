import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";

export const PurchaseExperiencePublicSchema = z.object({
  id: z.number().int(),
  customerId: z.number().int(),
  vehicleId: z.number().int(),
  branchId: z.number().int(),
  salespersonId: z.number().int().nullable(),
  purchaseDate: z.date().nullable(),
  deliveryDate: z.date().nullable(),
  externalSaleId: z.string().nullable(),
  // CX context labels for the sale (free-text ERP/import — never policy entities).
  financingType: z.string().nullable(),
  insuranceType: z.string().nullable(),
  salesChannel: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type PurchaseExperiencePublic = z.infer<typeof PurchaseExperiencePublicSchema>;

// Lightweight nested display refs for list/detail read projections. These are
// derived via relation joins (never persisted) so a client can render a row
// without a second round-trip. Kept minimal on purpose — id + human label only.
const CustomerRef = z.object({ id: z.number().int(), name: z.string() });
const MasterRef = z.object({ id: z.number().int(), code: z.string(), name: z.string() });
const VehicleRef = z.object({
  id: z.number().int(),
  vin: z.string().nullable(),
  modelYear: z.number().int().nullable(),
  color: z.string().nullable(),
  model: MasterRef,
});

/**
 * List/detail response shape: the scalar record enriched with lightweight nested
 * display data for customer, vehicle (+ model), branch and optional salesperson.
 * A superset of {@link PurchaseExperiencePublicSchema} — the scalar FK ids stay,
 * so it is backward compatible. Write endpoints keep the bare public shape.
 */
export const PurchaseExperienceEnrichedSchema = PurchaseExperiencePublicSchema.extend({
  customer: CustomerRef,
  vehicle: VehicleRef,
  branch: MasterRef,
  salesperson: MasterRef.nullable(),
});
export type PurchaseExperienceEnriched = z.infer<typeof PurchaseExperienceEnrichedSchema>;

export const ListPurchaseExperiencesQuerySchema = PaginationQuerySchema.extend({
  customerId: z.coerce.number().int().positive().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  // Filters through the authoritative Vehicle -> VehicleModel relation.
  vehicleModelId: z.coerce.number().int().positive().optional(),
  salespersonId: z.coerce.number().int().positive().optional(),
  purchaseDateFrom: z.coerce.date().optional(),
  purchaseDateTo: z.coerce.date().optional(),
  deliveryDateFrom: z.coerce.date().optional(),
  deliveryDateTo: z.coerce.date().optional(),
  sort: z.string().optional(),
});

const ExternalSaleId = z.string().trim().min(1).max(100);
const CxLabel = z.string().trim().min(1).max(100);

// Inline vehicle details for the "record a purchase" flow: the client enters the
// car the customer bought (model from master data + year + VIN) and the server
// creates the Vehicle transactionally with the experience. `vin` is optional; when
// present it must be unique (an existing VIN is rejected, never silently reused).
const InlineVehicleSchema = z.object({
  modelId: z.number().int().positive(),
  modelYear: z.number().int().min(1900).max(2100).optional(),
  vin: z.string().trim().min(1).max(64).optional(),
  color: z.string().trim().min(1).max(60).optional(),
});

// Exactly ONE vehicle source: either an existing `vehicleId` (import / back-compat)
// or inline `vehicle` details (the Customer-360 "add purchase" flow). The XOR is
// enforced in the service (NOT a schema `.refine`) — a top-level ZodEffects breaks
// OpenAPI request-body generation, so the body must stay a plain object.
export const CreatePurchaseExperienceSchema = z.object({
  customerId: z.number().int().positive(),
  vehicleId: z.number().int().positive().optional(),
  vehicle: InlineVehicleSchema.optional(),
  branchId: z.number().int().positive(),
  salespersonId: z.number().int().positive().optional(),
  purchaseDate: z.coerce.date().optional(),
  deliveryDate: z.coerce.date().optional(),
  externalSaleId: ExternalSaleId.optional(),
  financingType: CxLabel.optional(),
  insuranceType: CxLabel.optional(),
  salesChannel: CxLabel.optional(),
});

// customerId/vehicleId are immutable after creation (sending a changed value is
// rejected); branch, salesperson, dates, externalSaleId and the CX context labels
// are business-safe.
export const UpdatePurchaseExperienceSchema = z
  .object({
    customerId: z.number().int().positive(),
    vehicleId: z.number().int().positive(),
    branchId: z.number().int().positive(),
    salespersonId: z.number().int().positive().nullable(),
    purchaseDate: z.coerce.date().nullable(),
    deliveryDate: z.coerce.date().nullable(),
    externalSaleId: ExternalSaleId.nullable(),
    financingType: CxLabel.nullable(),
    insuranceType: CxLabel.nullable(),
    salesChannel: CxLabel.nullable(),
  })
  .partial();
