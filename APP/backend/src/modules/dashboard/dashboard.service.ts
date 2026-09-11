import type { FastifyInstance } from "fastify";
import { env } from "src/config/env";
import { hasPermission, type AuthUser } from "src/lib/context/auth-context";
import { PERMISSIONS } from "src/constants/permissions";
import { FINANCE_CURRENCY } from "src/modules/finance/finance.constants";
import { createFinanceAnalyticsService } from "src/modules/finance/finance-analytics.service";
import { createGpsService } from "src/modules/gps/gps.service";
import { createVehiclesService } from "src/modules/vehicles/vehicles.service";
import { vehicleDisplayName } from "src/modules/vehicles/vehicles.mapper";
import {
  resolveBusinessDay,
  resolveLastNCalendarDays,
} from "src/modules/reports/periods";
import {
  ACTIVE_RENTAL_STATUSES,
  DASHBOARD_RECENT_CONTRACTS_LIMIT,
  DASHBOARD_WEEK_DAYS,
  PENDING_LINK_STATUSES,
  READY_FOR_DELIVERY_STATUS,
  TODAY_DELIVERY_STATUSES,
} from "src/modules/dashboard/dashboard.constants";
import { buildWeeklyRentalActivity } from "src/modules/dashboard/dashboard.projection";

const P = PERMISSIONS;

const VEHICLE_NAME_SELECT = {
  vehicleName: true,
  modelYear: true,
  plateNumber: true,
  model: { select: { name: true } },
} as const;

/**
 * Diamond home dashboard aggregator. Composes existing domain services and
 * bounded Prisma counts — never HTTP calls to /finance, /contracts, or
 * /vehicles. Each section is permission-gated and error-isolated.
 */
export function createDashboardService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const vehicles = createVehiclesService(fastify);
  const financeAnalytics = createFinanceAnalyticsService(prisma);
  const gps = createGpsService(fastify);

  async function overview(viewer: AuthUser, now = new Date()) {
    const runSection = async <T>(label: string, perm: string, fn: () => Promise<T>): Promise<T | null> => {
      if (!hasPermission(viewer, perm)) return null;
      try {
        return await fn();
      } catch (err) {
        fastify.log.error({ err, section: label }, "dashboard section failed");
        return null;
      }
    };

    const offsetMinutes = env.BUSINESS_TIMEZONE_OFFSET_MINUTES;
    const week = resolveLastNCalendarDays(now, offsetMinutes, DASHBOARD_WEEK_DAYS);
    const today = resolveBusinessDay(now, offsetMinutes);

    const [fleetStatus, contractKpis, weeklyFinance, weeklyRentalActivity, todayDeliveries, recentContracts, gpsOnline] =
      await Promise.all([
        runSection("fleetStatus", P.VEHICLES_READ, () => vehicles.activeFleetStatusCounts()),
        runSection("kpis", P.CONTRACTS_READ, async () => {
          const [activeRentals, pendingLinks, deliveries, readyForDelivery, contractsTotal] = await Promise.all([
            prisma.contract.count({ where: { status: { in: [...ACTIVE_RENTAL_STATUSES] } } }),
            prisma.contract.count({ where: { status: { in: [...PENDING_LINK_STATUSES] } } }),
            prisma.contract.count({
              where: {
                status: { in: [...TODAY_DELIVERY_STATUSES] },
                startAt: { gte: today.from, lt: today.to },
              },
            }),
            prisma.contract.count({
              where: {
                status: READY_FOR_DELIVERY_STATUS,
                startAt: { gte: today.from, lt: today.to },
              },
            }),
            prisma.contract.count(),
          ]);
          return { activeRentals, pendingLinks, deliveriesToday: deliveries, readyForDelivery, contractsTotal };
        }),
        runSection("weeklyFinance", P.FINANCE_READ, async () => {
          const period = { from: week.from, to: week.to };
          const [collected, expenses, breakdown] = await Promise.all([
            financeAnalytics.sumCollected(period),
            financeAnalytics.sumExpenses(period),
            financeAnalytics.movementBreakdown(period),
          ]);
          return {
            from: week.from,
            to: week.to,
            collected,
            expenses,
            netMovement: collected - expenses,
            currency: FINANCE_CURRENCY,
            breakdown: breakdown.filter((slice) => slice.amount > 0),
          };
        }),
        runSection("weeklyRentalActivity", P.CONTRACTS_READ, async () => {
          const [outs, ins] = await Promise.all([
            prisma.contractCarOut.findMany({
              where: { occurredAt: { gte: week.from, lt: week.to } },
              select: { occurredAt: true },
            }),
            prisma.contractCarIn.findMany({
              where: { occurredAt: { gte: week.from, lt: week.to } },
              select: { occurredAt: true },
            }),
          ]);
          return buildWeeklyRentalActivity(
            week.days,
            outs.map((row) => row.occurredAt),
            ins.map((row) => row.occurredAt),
            offsetMinutes,
          );
        }),
        runSection("todayDeliveries", P.CONTRACTS_READ, async () => {
          const rows = await prisma.contract.findMany({
            where: {
              status: { in: [...TODAY_DELIVERY_STATUSES] },
              startAt: { gte: today.from, lt: today.to },
            },
            orderBy: { startAt: "asc" },
            select: {
              id: true,
              contractNumber: true,
              status: true,
              startAt: true,
              customer: { select: { name: true } },
              vehicle: { select: VEHICLE_NAME_SELECT },
            },
          });
          return rows.map((row) => ({
            id: row.id,
            contractNumber: row.contractNumber,
            customerName: row.customer?.name ?? null,
            vehicleName: vehicleDisplayName({
              vehicleName: row.vehicle.vehicleName,
              modelName: row.vehicle.model?.name ?? null,
              modelYear: row.vehicle.modelYear,
              plateNumber: row.vehicle.plateNumber,
            }),
            startAt: row.startAt!,
            status: row.status,
          }));
        }),
        runSection("recentContracts", P.CONTRACTS_READ, async () => {
          const rows = await prisma.contract.findMany({
            orderBy: { createdAt: "desc" },
            take: DASHBOARD_RECENT_CONTRACTS_LIMIT,
            select: {
              id: true,
              contractNumber: true,
              status: true,
              customer: { select: { name: true } },
              createdBy: { select: { name: true } },
              vehicle: { select: VEHICLE_NAME_SELECT },
            },
          });
          return rows.map((row) => ({
            id: row.id,
            contractNumber: row.contractNumber,
            customerName: row.customer?.name ?? null,
            vehicleName: vehicleDisplayName({
              vehicleName: row.vehicle.vehicleName,
              modelName: row.vehicle.model?.name ?? null,
              modelYear: row.vehicle.modelYear,
              plateNumber: row.vehicle.plateNumber,
            }),
            employeeName: row.createdBy.name ?? null,
            status: row.status,
          }));
        }),
        runSection("gpsOnline", P.GPS_READ, async () => {
          const summary = await gps.summary();
          return summary.online;
        }),
      ]);

    return {
      generatedAt: now,
      range: { from: week.from, to: week.to },
      today: { from: today.from, to: today.to, offsetMinutes },
      kpis: {
        activeRentals: contractKpis?.activeRentals ?? null,
        fleetTotal: fleetStatus?.total ?? null,
        fleetRented: fleetStatus?.rented ?? null,
        fleetAvailable: fleetStatus?.available ?? null,
        fleetService: fleetStatus?.service ?? null,
        pendingLinks: contractKpis?.pendingLinks ?? null,
        deliveriesToday: contractKpis?.deliveriesToday ?? null,
        readyForDelivery: contractKpis?.readyForDelivery ?? null,
        contractsTotal: contractKpis?.contractsTotal ?? null,
      },
      weeklyFinance,
      weeklyRentalActivity,
      fleetStatus,
      todayDeliveries,
      recentContracts,
      gpsOnline,
    };
  }

  return { overview };
}
