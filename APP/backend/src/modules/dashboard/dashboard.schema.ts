import { z } from "zod";

/**
 * Diamond home dashboard aggregate. Cross-domain sections are NULLABLE: null
 * when the viewer lacks the section's domain read permission, or when that
 * section failed to compute. `null` means "not available", never "zero".
 */

const ContractStatusSchema = z.enum([
  "AWAITING",
  "FORM",
  "SIGNED",
  "PAID",
  "ACTIVE",
  "RETOUT",
  "REVIEW",
  "CLOSED",
]);

const DashboardKpisSchema = z.object({
  activeRentals: z.number().int().nullable(),
  fleetTotal: z.number().int().nullable(),
  fleetRented: z.number().int().nullable(),
  fleetAvailable: z.number().int().nullable(),
  fleetService: z.number().int().nullable(),
  pendingLinks: z.number().int().nullable(),
  deliveriesToday: z.number().int().nullable(),
  readyForDelivery: z.number().int().nullable(),
  contractsTotal: z.number().int().nullable(),
});

const WeeklyFinanceSliceSchema = z.object({
  key: z.enum([
    "RENTAL_PAYMENT",
    "RENEWAL_PAYMENT",
    "RECONCILIATION_PAYMENT",
    "POST_CLOSE_RECEIVABLE_PAYMENT",
    "MAINTENANCE_EXPENSE",
    "MANUAL_EXPENSE",
  ]),
  direction: z.enum(["COLLECTION", "EXPENSE"]),
  amount: z.number().int(),
});

const WeeklyFinanceSchema = z.object({
  from: z.date(),
  to: z.date(),
  collected: z.number().int(),
  expenses: z.number().int(),
  netMovement: z.number().int(),
  currency: z.string(),
  breakdown: z.array(WeeklyFinanceSliceSchema),
});

const WeeklyRentalActivityPointSchema = z.object({
  date: z.string(),
  rented: z.number().int(),
  returned: z.number().int(),
});

const FleetStatusSchema = z.object({
  total: z.number().int(),
  available: z.number().int(),
  rented: z.number().int(),
  service: z.number().int(),
});

/// Row-level company identity only. The dashboard KPIs stay whole-business: there
/// is no dashboard company scope, and this ref exists so a row can show which
/// company a Contract belongs to without one lookup per row.
const DashboardCompanyRefSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  displayName: z.string(),
  accentColor: z.string(),
});

const TodayDeliverySchema = z.object({
  id: z.string(),
  contractNumber: z.string(),
  customerName: z.string().nullable(),
  vehicleName: z.string(),
  startAt: z.date(),
  status: ContractStatusSchema,
  company: DashboardCompanyRefSchema,
});

const RecentContractSchema = z.object({
  id: z.string(),
  contractNumber: z.string(),
  customerName: z.string().nullable(),
  vehicleName: z.string(),
  employeeName: z.string().nullable(),
  status: ContractStatusSchema,
  company: DashboardCompanyRefSchema,
});

export const DashboardOverviewSchema = z.object({
  generatedAt: z.date(),
  range: z.object({ from: z.date(), to: z.date() }),
  today: z.object({ from: z.date(), to: z.date(), offsetMinutes: z.number().int() }),
  kpis: DashboardKpisSchema,
  weeklyFinance: WeeklyFinanceSchema.nullable(),
  weeklyRentalActivity: z.array(WeeklyRentalActivityPointSchema).nullable(),
  fleetStatus: FleetStatusSchema.nullable(),
  todayDeliveries: z.array(TodayDeliverySchema).nullable(),
  recentContracts: z.array(RecentContractSchema).nullable(),
  gpsOnline: z.number().int().nullable(),
});
