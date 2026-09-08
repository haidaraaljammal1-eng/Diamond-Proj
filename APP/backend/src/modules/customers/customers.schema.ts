import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";
import { BooleanQueryParam } from "src/lib/master-data/code";

export const CustomerTypeSchema = z.enum(["INDIVIDUAL", "COMPANY"]);

export const CustomerPublicSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  mobile: z.string().nullable(),
  email: z.string().nullable(),
  type: CustomerTypeSchema,
  optOutEmail: z.boolean(),
  optOutSms: z.boolean(),
  optOutPhone: z.boolean(),
  optOutWhatsApp: z.boolean(),
  externalId: z.string().nullable(),
  isActive: z.boolean(),
  nationality: z.string().nullable(),
  identityNumber: z.string().nullable(),
  passportNumber: z.string().nullable(),
  drivingLicenseNumber: z.string().nullable(),
  drivingLicenseExpiry: z.date().nullable(),
  address: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type CustomerPublic = z.infer<typeof CustomerPublicSchema>;

export const ListCustomersQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  type: CustomerTypeSchema.optional(),
  active: BooleanQueryParam,
  // Filter to customers REACHED THROUGH this branch — i.e. holding at least one
  // PurchaseExperience there (Customer has no branchId; see customer-scope.ts).
  // Applied on top of, never instead of, the viewer's branch visibility.
  branchId: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
});

// --- List row projection (N+1 fix) ---
// The customers table renders a sales summary (latest purchase + distinct
// branches/salespeople/VINs) per row. Previously the client fetched it PER ROW
// (one /purchase-experiences request each) — a classic N+1 that scaled with page
// size. It is now folded into ListCustomers as ONE projection, enriched by a
// fixed batch query (WHERE customerId IN (page ids)). The enrichment is
// permission-tiered: `sales` is null for callers without purchase_experiences.read
// — so this never broadens access.

/** The single "latest" purchase (by composite recency) for the row's headline cells. */
const CustomerLatestSaleSchema = z.object({
  deliveryDate: z.date().nullable(),
  vehicleModel: z.string().nullable(),
  vehicleModelYear: z.number().int().nullable(),
  vin: z.string().nullable(),
  branch: z.string().nullable(),
  salesperson: z.string().nullable(),
});

/** Per-customer sales rollup — latest sale + distinct multi-value lists (for the
 *  "+N" overflow the table shows). Empty (count 0, null latest, [] lists) when the
 *  customer has no experiences; the whole object is null when the caller lacks
 *  purchase_experiences.read. */
export const CustomerSalesSummarySchema = z.object({
  experienceCount: z.number().int(),
  latest: CustomerLatestSaleSchema.nullable(),
  branches: z.array(z.string()),
  salespeople: z.array(z.string()),
  vins: z.array(z.string()),
});

export const CustomerListItemSchema = CustomerPublicSchema.extend({
  sales: CustomerSalesSummarySchema.nullable(),
});
export type CustomerListItem = z.infer<typeof CustomerListItemSchema>;

// Contact fields are validated leniently (ERP data varies) and normalized in the
// service. mobile/email are NOT unique.
const Mobile = z.string().trim().min(3).max(30);
const Email = z.string().trim().min(3).max(200);
const ExternalId = z.string().trim().min(1).max(100);

export const CreateCustomerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  mobile: Mobile.optional(),
  email: Email.optional(),
  type: CustomerTypeSchema.optional(),
  optOutEmail: z.boolean().optional(),
  optOutSms: z.boolean().optional(),
  optOutPhone: z.boolean().optional(),
  optOutWhatsApp: z.boolean().optional(),
  externalId: ExternalId.optional(),
  nationality: z.string().trim().min(2).max(80).optional(),
  identityNumber: z.string().trim().min(3).max(50).optional(),
  passportNumber: z.string().trim().min(3).max(50).optional(),
  drivingLicenseNumber: z.string().trim().min(3).max(50).optional(),
  drivingLicenseExpiry: z.coerce.date().optional(),
  address: z.string().trim().max(400).optional(),
});

export const UpdateCustomerSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    mobile: Mobile.nullable(),
    email: Email.nullable(),
    type: CustomerTypeSchema,
    optOutEmail: z.boolean(),
    optOutSms: z.boolean(),
    optOutPhone: z.boolean(),
    optOutWhatsApp: z.boolean(),
    externalId: ExternalId.nullable(),
    nationality: z.string().trim().min(2).max(80).nullable(),
    identityNumber: z.string().trim().min(3).max(50).nullable(),
    passportNumber: z.string().trim().min(3).max(50).nullable(),
    drivingLicenseNumber: z.string().trim().min(3).max(50).nullable(),
    drivingLicenseExpiry: z.coerce.date().nullable(),
    address: z.string().trim().max(400).nullable(),
  })
  .partial();

/** Contact fields whose change is audited (field names only, never values). */
export const CUSTOMER_CONTACT_FIELDS = [
  "mobile",
  "email",
  "optOutEmail",
  "optOutSms",
  "optOutPhone",
  "optOutWhatsApp",
] as const;

// --- Customer 360 (derived read projection; not persisted) ---

const Ref = z.object({ id: z.number().int(), code: z.string(), name: z.string() });

export const Customer360Schema = z.object({
  customer: CustomerPublicSchema,
  complaints: z.object({
    openComplaintsCount: z.number().int(),
    latestComplaint: z.string().nullable(),
    latestComplaintStage: z.string().nullable(),
    latestComplaintPriority: z.string().nullable(),
    latestComplaintCategoryAr: z.string().nullable(),
    latestComplaintCategoryEn: z.string().nullable(),
    latestComplaintDepartment: z.string().nullable(),
    latestComplaintOpenedAt: z.date().nullable(),
    latestComplaintClosedAt: z.date().nullable(),
    history: z.array(
      z.object({
        id: z.number().int(),
        publicNumber: z.string(),
        stage: z.string(),
        priority: z.string(),
        lifecycleStatus: z.string(),
        // Complaint category (bilingual) + owning department — for the 360 card title/meta.
        categoryAr: z.string().nullable(),
        categoryEn: z.string().nullable(),
        department: z.string().nullable(),
        openedAt: z.date(),
      }),
    ),
  }),
  callCenter: z.object({
    totalCalls: z.number().int(),
    latestCallDate: z.date().nullable(),
    latestOutcome: z.string().nullable(),
    pendingCallbackAt: z.date().nullable(),
    unreachable: z.boolean(),
  }),
  // REMOVED: `communicationTimeline`.
  //
  // It was named like the full communication stream but was built from call
  // sessions ONLY (`recentCalls.map(...)`), so a customer reached solely by email
  // or SMS got `[]` — which reads as "we never contacted this customer" when in
  // fact several messages were sent. Measured on real data (customer 13): the
  // field returned 1 event while the customer had 8 real touchpoints.
  //
  // It was also the one call-data surface that skipped the permission tiering the
  // rest of the system applies: `/360` is gated on `customers.read` alone, yet the
  // field exposed per-call outcomes and `agentUserId` to callers without
  // `call_center_calls.read`.
  //
  // A per-call list belongs to the call-center screens, which apply their own
  // permission tiering. The call SUMMARY a 360 screen needs lives in `callCenter`.
  latestExperienceId: z.number().int().nullable(),
  experiences: z.array(
    z.object({
      id: z.number().int(),
      purchaseDate: z.date().nullable(),
      deliveryDate: z.date().nullable(),
      externalSaleId: z.string().nullable(),
      // CX context labels for the sale (free-text; may be absent).
      financingType: z.string().nullable(),
      insuranceType: z.string().nullable(),
      salesChannel: z.string().nullable(),
      vehicle: z.object({
        id: z.number().int(),
        vin: z.string().nullable(),
        modelYear: z.number().int().nullable(),
        color: z.string().nullable(),
        model: Ref.nullable(),
      }),
      branch: Ref,
      salesperson: Ref.nullable(),
    }),
  ),
});
export type Customer360 = z.infer<typeof Customer360Schema>;

