import type { Prisma, PrismaClient } from "@prisma/client";
import { withTransaction } from "src/lib/db/transaction";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { GPS_BINDING_LOCK_NS } from "src/modules/gps/gps.constants";
import {
  gpsBindingDeviceConflictError,
  gpsCompanyScopeViolationError,
  gpsProviderAccountNotFoundError,
  gpsProviderExtrasInvalidError,
  gpsVehicleNotFoundError,
} from "src/modules/gps/gps.errors";
import { sanitizeGpsProviderExtras } from "src/modules/gps/gps-provider-extras";

export type AssignVehicleGpsBindingInput = {
  vehicleId: number;
  providerAccountId: string;
  externalDeviceId: string;
  externalDeviceUid?: string | null;
  deviceType?: string | null;
  providerDeviceTypeId?: string | null;
  simNumber?: string | null;
  installationType?: string | null;
  installationDate?: Date | null;
  subscriptionExpiresAt?: Date | null;
  providerDeviceExtras?: Record<string, unknown> | null;
};

function bindingAssignmentChanged(
  existing: {
    providerAccountId: string;
    externalDeviceId: string;
  },
  next: AssignVehicleGpsBindingInput,
): boolean {
  return (
    existing.providerAccountId !== next.providerAccountId ||
    existing.externalDeviceId !== next.externalDeviceId
  );
}

export function createGpsBindingService(prisma: PrismaClient) {
  async function loadAccount(providerAccountId: string) {
    const account = await prisma.gpsProviderAccount.findUnique({
      where: { id: providerAccountId },
    });
    if (!account) throw gpsProviderAccountNotFoundError();
    return account;
  }

  async function assertCompanyScope(
    account: { companyScopeId: number | null },
    vehicle: { companyId: number },
  ): Promise<void> {
    if (account.companyScopeId == null) return;
    if (vehicle.companyId !== account.companyScopeId) {
      throw gpsCompanyScopeViolationError();
    }
  }

  async function assertDeviceAvailable(
    tx: Prisma.TransactionClient,
    providerAccountId: string,
    externalDeviceId: string,
    exceptVehicleId?: number,
  ): Promise<void> {
    const conflict = await tx.vehicleGpsBinding.findFirst({
      where: {
        providerAccountId,
        externalDeviceId,
        isActive: true,
        ...(exceptVehicleId != null ? { vehicleId: { not: exceptVehicleId } } : {}),
      },
      select: { vehicleId: true },
    });
    if (conflict) throw gpsBindingDeviceConflictError();
  }

  async function appendHistory(
    tx: Prisma.TransactionClient,
    binding: {
      vehicleId: number;
      providerAccountId: string;
      providerKey: string;
      externalDeviceId: string;
      externalDeviceUid: string | null;
    },
  ): Promise<void> {
    await tx.vehicleGpsBindingHistory.create({
      data: {
        vehicleId: binding.vehicleId,
        providerAccountId: binding.providerAccountId,
        providerKey: binding.providerKey,
        externalDeviceId: binding.externalDeviceId,
        externalDeviceUid: binding.externalDeviceUid,
      },
    });
  }

  async function clearLatestStateIfAssignmentChanged(
    tx: Prisma.TransactionClient,
    vehicleId: number,
    changed: boolean,
  ): Promise<void> {
    if (!changed) return;
    await tx.vehicleGpsLatestState.deleteMany({ where: { vehicleId } });
  }

  /**
   * Create or update the single current binding for a vehicle.
   * Rebind writes history and clears latest telemetry when account/device changes.
   */
  async function assignBinding(input: AssignVehicleGpsBindingInput): Promise<{ bindingId: string }> {
    let extras: Prisma.InputJsonValue | null | undefined;
    try {
      extras = sanitizeGpsProviderExtras(input.providerDeviceExtras) as Prisma.InputJsonValue | null;
    } catch {
      throw gpsProviderExtrasInvalidError();
    }

    return withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, GPS_BINDING_LOCK_NS, input.vehicleId);

      const vehicle = await tx.vehicle.findUnique({
        where: { id: input.vehicleId },
        select: { id: true, companyId: true },
      });
      if (!vehicle) throw gpsVehicleNotFoundError();

      const account = await tx.gpsProviderAccount.findUnique({
        where: { id: input.providerAccountId },
      });
      if (!account) throw gpsProviderAccountNotFoundError();
      // `enabled` controls sync eligibility only — bindings remain valid when disabled.

      await assertCompanyScope(account, vehicle);
      await assertDeviceAvailable(
        tx,
        input.providerAccountId,
        input.externalDeviceId,
        input.vehicleId,
      );

      const existing = await tx.vehicleGpsBinding.findUnique({
        where: { vehicleId: input.vehicleId },
      });

      const data = {
        providerAccountId: input.providerAccountId,
        providerKey: account.providerKey,
        externalDeviceId: input.externalDeviceId,
        externalDeviceUid: input.externalDeviceUid ?? null,
        deviceType: input.deviceType ?? null,
        providerDeviceTypeId: input.providerDeviceTypeId ?? null,
        simNumber: input.simNumber ?? null,
        installationType: input.installationType ?? null,
        installationDate: input.installationDate ?? null,
        subscriptionExpiresAt: input.subscriptionExpiresAt ?? null,
        providerDeviceExtras: extras ?? undefined,
        isActive: true,
      };

      if (!existing) {
        const created = await tx.vehicleGpsBinding.create({
          data: {
            vehicleId: input.vehicleId,
            ...data,
          },
        });
        return { bindingId: created.id };
      }

      const changed = bindingAssignmentChanged(existing, input);
      if (changed) {
        await appendHistory(tx, existing);
        await clearLatestStateIfAssignmentChanged(tx, input.vehicleId, true);
      }

      const updated = await tx.vehicleGpsBinding.update({
        where: { id: existing.id },
        data,
      });
      return { bindingId: updated.id };
    });
  }

  async function deactivateBinding(vehicleId: number): Promise<void> {
    await withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, GPS_BINDING_LOCK_NS, vehicleId);
      const existing = await tx.vehicleGpsBinding.findUnique({
        where: { vehicleId },
      });
      if (!existing?.isActive) return;
      await appendHistory(tx, existing);
      await tx.vehicleGpsBinding.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
      await tx.vehicleGpsLatestState.deleteMany({ where: { vehicleId } });
    });
  }

  return {
    assignBinding,
    deactivateBinding,
    loadAccount,
  };
}
