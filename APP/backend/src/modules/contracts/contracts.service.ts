import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { AppError } from "src/lib/errors/app-error";
import { withTransaction } from "src/lib/db/transaction";
import { writeOutboxEvent } from "src/lib/db/outbox";
import { runIdempotent, fingerprintIdempotentPayload } from "src/lib/db/idempotency";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { paginate, parseSort } from "src/lib/http/pagination";
import { normalizeEmail, normalizePhone } from "src/lib/security/normalize";
import { resolveStoragePath } from "src/lib/files/storage-key";
import { env } from "src/config/env";
import { expiryFromNow, generateOpaqueToken, hashToken } from "src/lib/security/tokens";
import { vehicleDisplayName } from "src/modules/vehicles/vehicles.mapper";
import {
  CONTRACT_CURRENCY,
  CONTRACT_LICENSE_LOCK_NS,
  CONTRACT_PAYMENT_LOCK_NS,
  CONTRACT_TERMS_VERSION,
  DRIVING_LICENSE_UPLOAD_MIME,
  INSPECTION_ANGLES,
  PAYMENT_STATUS_TOKEN_TTL_SECONDS,
} from "src/modules/contracts/contracts.constants";
import { allocateContractNumber } from "src/modules/contracts/contracts-number";
import { assertStatus, assertTransition } from "src/modules/contracts/contracts-status";
import { buildContractSnapshot } from "src/modules/contracts/contracts-snapshot";
import {
  completeRentalLinks,
  issueContractLink,
  markLinkUsed,
  resolveContractLink,
} from "src/modules/contracts/contracts-links";
import { assertVehicleFreeForRental } from "src/modules/contracts/vehicle-rental-guard";
import { contractError } from "src/modules/contracts/contracts.errors";
import {
  CONTRACT_DETAIL_INCLUDE,
  toDetail,
  toListItem,
} from "src/modules/contracts/contracts.mapper";
import {
  PUBLIC_RENTAL_INCLUDE,
  toPublicRentalContext,
} from "src/modules/contracts/public-rental-context";
import { evaluateDrivingLicenseOcr } from "src/modules/contracts/driving-license-policy";
import { createDrivingLicenseOcrProvider } from "src/modules/contracts/ocr/ocr-provider.factory";
import { createPaymentProvider } from "src/modules/contracts/payment/payment-provider.factory";
import { createFilesService } from "src/modules/files/files.service";
import type { MultipartFile } from "@fastify/multipart";
import type {
  CarInSchema,
  CarOutSchema,
  ConfirmPaymentSchema,
  CreateOfferInput,
  PublicAcceptSchema,
  PublicFormSchema,
  ReconcileSchema,
  RenewSchema,
} from "src/modules/contracts/contracts.schema";
import type { z } from "zod";
import type { ListContractsQuerySchema } from "src/modules/contracts/contracts.schema";

const SORTABLE = ["createdAt", "contractNumber", "startAt", "endAt", "agreedAmount", "status"] as const;

function assertEightAngles(photos: { angle: string }[]): void {
  const set = new Set(photos.map((p) => p.angle));
  if (photos.length !== 8 || set.size !== 8) {
    throw AppError.validation("Car inspection requires all 8 unique angles");
  }
  for (const angle of INSPECTION_ANGLES) {
    if (!set.has(angle)) throw AppError.validation("Car inspection requires all 8 unique angles");
  }
}

function derivedEndAt(startAt: Date | null | undefined, days: number, fallback = new Date()): Date {
  const start = startAt ?? fallback;
  return new Date(start.getTime() + days * 86_400_000);
}

export function createContractsService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const files = createFilesService(fastify);

  function assertLicenseProgress(
    status: string | null | undefined,
    expiryDate?: Date | null,
  ): void {
    if (status === "VALID") return;
    if (status === "EXPIRED") {
      throw contractError.drivingLicenseExpired(
        expiryDate
          ? expiryDate.toISOString().slice(0, 10)
          : undefined,
      );
    }
    if (status === "PROVIDER_UNAVAILABLE") throw contractError.drivingLicenseOcrNotConfigured();
    if (status === "UNREADABLE") throw contractError.drivingLicenseUnreadable();
    if (status === "REVIEW_REQUIRED") throw contractError.drivingLicenseReviewRequired();
    throw contractError.drivingLicenseRequired();
  }

  async function loadPublicRental(tx: Parameters<Parameters<typeof withTransaction>[1]>[0], id: string) {
    const row = await tx.contract.findUnique({
      where: { id },
      include: PUBLIC_RENTAL_INCLUDE,
    });
    if (!row) throw contractError.notFound();
    return toPublicRentalContext(row);
  }

  async function latestLicense(tx: Parameters<Parameters<typeof withTransaction>[1]>[0], contractId: string) {
    return tx.drivingLicenseVerification.findFirst({
      where: { contractId },
      orderBy: { createdAt: "desc" },
    });
  }

  async function loadDetail(id: string) {
    const row = await prisma.contract.findUnique({
      where: { id },
      include: CONTRACT_DETAIL_INCLUDE,
    });
    if (!row) throw contractError.notFound();
    return row;
  }

  async function emit(
    tx: Parameters<Parameters<typeof withTransaction>[1]>[0],
    eventType: string,
    contractId: string,
    extra: Record<string, unknown> = {},
  ) {
    // Dedupe keys must be unique per occurrence; Postgres aborts the tx on unique violations.
    await writeOutboxEvent(tx, {
      eventType,
      aggregateType: "contract",
      aggregateId: contractId,
      dedupeKey: `${eventType}:${contractId}:${extra.dedupe ?? "v1"}`,
      payload: { contractId, ...extra, dedupe: undefined },
    });
  }

  async function createOffer(input: CreateOfferInput, actorUserId: number) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: input.vehicleId },
      include: { model: { select: { name: true } } },
    });
    if (!vehicle || !vehicle.isActive) throw contractError.vehicleNotAvailable();
    if (vehicle.operationalStatus === "SERVICE") throw contractError.vehicleNotAvailable();
    if (input.customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
      if (!customer) throw contractError.customerNotFound();
    }

    const startAt = input.startAt ?? new Date();
    const endAt = input.endAt ?? derivedEndAt(startAt, input.rentalDays, startAt);

    return withTransaction(prisma, async (tx) => {
      const contractNumber = await allocateContractNumber(tx);
      const created = await tx.contract.create({
        data: {
          contractNumber,
          vehicleId: input.vehicleId,
          customerId: input.customerId ?? null,
          createdByUserId: actorUserId,
          assignedEmployeeUserId: input.assignedEmployeeUserId ?? null,
          priceType: input.priceType,
          rentalDays: input.rentalDays,
          agreedAmount: input.agreedAmount,
          currency: CONTRACT_CURRENCY,
          startAt,
          endAt,
          depositAmount: input.depositAmount ?? null,
        },
      });
      await emit(tx, "contract.created", created.id, { vehicleId: input.vehicleId });
      return toDetail(
        await tx.contract.findUniqueOrThrow({
          where: { id: created.id },
          include: CONTRACT_DETAIL_INCLUDE,
        }),
      );
    });
  }

  async function list(query: z.infer<typeof ListContractsQuerySchema>) {
    const where: Prisma.ContractWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { contractNumber: { contains: query.search, mode: "insensitive" } },
              { vehicle: { plateNumber: { contains: query.search, mode: "insensitive" } } },
              { vehicle: { vehicleName: { contains: query.search, mode: "insensitive" } } },
              { customer: { name: { contains: query.search, mode: "insensitive" } } },
              { customer: { mobile: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const { field, direction } = parseSort(query.sort, SORTABLE, {
      field: "createdAt",
      direction: "desc",
    });
    return paginate({
      page: query.page,
      pageSize: query.pageSize,
      count: () => prisma.contract.count({ where }),
      findMany: async (skip, take) => {
        const rows = await prisma.contract.findMany({
          where,
          include: {
            vehicle: { include: { model: { select: { name: true } } } },
            customer: { select: { name: true } },
          },
          orderBy: { [field]: direction },
          skip,
          take,
        });
        return rows.map(toListItem);
      },
    });
  }

  async function get(id: string) {
    return toDetail(await loadDetail(id));
  }

  async function generateLink(
    contractId: string,
    type: "RENTAL" | "RETURN" | "RENEWAL",
    actorUserId: number,
  ) {
    return withTransaction(prisma, async (tx) => {
      const contract = await tx.contract.findUnique({ where: { id: contractId } });
      if (!contract) throw contractError.notFound();
      if (contract.status === "CLOSED") throw contractError.alreadyClosed();

      if (type === "RENTAL" && !["AWAITING", "FORM", "SIGNED"].includes(contract.status)) {
        throw contractError.invalidTransition(contract.status, contract.status);
      }
      if (type === "RETURN") {
        if (contract.status === "ACTIVE") {
          assertTransition("ACTIVE", "RETOUT");
          await tx.contract.update({
            where: { id: contractId },
            data: { status: "RETOUT", revision: { increment: 1 } },
          });
          await emit(tx, "contract.return_started", contractId);
        } else if (contract.status !== "RETOUT") {
          throw contractError.invalidTransition(contract.status, "RETOUT");
        }
      }
      if (type === "RENEWAL" && contract.status !== "ACTIVE") {
        throw contractError.invalidTransition(contract.status, "ACTIVE");
      }

      const issued = await issueContractLink(tx, {
        contractId,
        type,
        createdByUserId: actorUserId,
      });
      return {
        contractId,
        contractNumber: contract.contractNumber,
        link: { token: issued.token, expiresAt: issued.expiresAt, type },
      };
    });
  }

  async function confirmPayment(
    contractId: string,
    input: z.infer<typeof ConfirmPaymentSchema>,
    actorUserId: number,
    idempotencyKey?: string,
  ) {
    const run = async () =>
      withTransaction(prisma, async (tx) => {
        const contract = await tx.contract.findUnique({ where: { id: contractId } });
        if (!contract) throw contractError.notFound();
        if (contract.status === "PAID" || contract.status === "ACTIVE") {
          return toDetail(
            await tx.contract.findUniqueOrThrow({
              where: { id: contractId },
              include: CONTRACT_DETAIL_INCLUDE,
            }),
          );
        }
        assertTransition(contract.status, "PAID");
        await assertVehicleFreeForRental(tx, contract.vehicleId, contract.id);

        await tx.contractPayment.create({
          data: {
            contractId,
            amount: input.amount ?? contract.agreedAmount,
            currency: contract.currency,
            method: input.method,
            status: "CONFIRMED",
            externalReference: input.externalReference ?? null,
            confirmedAt: new Date(),
            createdByUserId: actorUserId,
          },
        });
        await tx.contract.update({
          where: { id: contractId },
          data: { status: "PAID", revision: { increment: 1 } },
        });
        await completeRentalLinks(tx, contractId);
        await emit(tx, "contract.paid", contractId, { vehicleId: contract.vehicleId });
        return toDetail(
          await tx.contract.findUniqueOrThrow({
            where: { id: contractId },
            include: CONTRACT_DETAIL_INCLUDE,
          }),
        );
      });

    if (!idempotencyKey) return run();
    const outcome = await runIdempotent(
      prisma,
      {
        scope: `contract:payment:${contractId}`,
        key: idempotencyKey,
        fingerprint: fingerprintIdempotentPayload({
          method: input.method,
          amount: input.amount ?? null,
          externalReference: input.externalReference ?? null,
        }),
      },
      run,
    );
    if (outcome.deduped) return get(contractId);
    return outcome.result!;
  }

  async function carOut(
    contractId: string,
    input: z.infer<typeof CarOutSchema>,
    actorUserId: number,
    idempotencyKey?: string,
  ) {
    assertEightAngles(input.photos);
    const run = async () =>
      withTransaction(prisma, async (tx) => {
        const contract = await tx.contract.findUnique({
          where: { id: contractId },
          include: { carOut: true },
        });
        if (!contract) throw contractError.notFound();
        if (contract.status === "ACTIVE" && contract.carOut) {
          return toDetail(
            await tx.contract.findUniqueOrThrow({
              where: { id: contractId },
              include: CONTRACT_DETAIL_INCLUDE,
            }),
          );
        }
        assertTransition(contract.status, "ACTIVE");
        await assertVehicleFreeForRental(tx, contract.vehicleId, contract.id);

        const confirmed = await tx.contractPayment.findFirst({
          where: { contractId, status: "CONFIRMED" },
        });
        if (!confirmed) throw contractError.paymentRequired();

        const now = input.occurredAt ?? new Date();
        const carOutRow = await tx.contractCarOut.create({
          data: {
            contractId,
            performedByUserId: actorUserId,
            occurredAt: now,
            mileageOut: input.mileageOut,
            fuelOut: input.fuelOut,
            notes: input.notes ?? null,
          },
        });
        await tx.contractCarOutPhoto.createMany({
          data: input.photos.map((p, i) => ({
            carOutId: carOutRow.id,
            attachmentId: p.attachmentId,
            angle: p.angle,
            sortOrder: i,
          })),
        });
        await tx.contract.update({
          where: { id: contractId },
          data: { status: "ACTIVE", activatedAt: now, revision: { increment: 1 } },
        });
        await tx.vehicle.update({
          where: { id: contract.vehicleId },
          data: { operationalStatus: "RENTED" },
        });
        await emit(tx, "contract.activated", contractId, { vehicleId: contract.vehicleId });
        return toDetail(
          await tx.contract.findUniqueOrThrow({
            where: { id: contractId },
            include: CONTRACT_DETAIL_INCLUDE,
          }),
        );
      });

    if (!idempotencyKey) return run();
    const outcome = await runIdempotent(
      prisma,
      {
        scope: `contract:car-out:${contractId}`,
        key: idempotencyKey,
        fingerprint: fingerprintIdempotentPayload({
          mileageOut: input.mileageOut,
          fuelOut: input.fuelOut,
          notes: input.notes ?? null,
          occurredAt: input.occurredAt?.toISOString() ?? null,
          photos: input.photos,
        }),
      },
      run,
    );
    if (outcome.deduped) return get(contractId);
    return outcome.result!;
  }

  async function submitPublicForm(token: string, input: z.infer<typeof PublicFormSchema>) {
    if (!input.identityNumber && !input.passportNumber) {
      throw contractError.publicFormIncomplete();
    }
    return withTransaction(prisma, async (tx) => {
      const link = await resolveContractLink(tx, token, "RENTAL");
      const contract = await tx.contract.findUnique({
        where: { id: link.contractId },
        include: { vehicle: { include: { model: { select: { name: true } } } } },
      });
      if (!contract) throw contractError.notFound();
      if (contract.status !== "AWAITING" && contract.status !== "FORM") {
        throw contractError.invalidTransition(contract.status, "FORM");
      }

      const verification = await latestLicense(tx, contract.id);
      assertLicenseProgress(verification?.status, verification?.expiryDate);
      if (!verification?.licenseNumber || !verification.expiryDate) {
        throw contractError.drivingLicenseRequired();
      }

      const customerData = {
        name: input.name,
        mobile: normalizePhone(input.mobile),
        email: input.email ? normalizeEmail(input.email) : null,
        nationality: input.nationality,
        identityNumber: input.identityNumber ?? null,
        passportNumber: input.passportNumber ?? null,
        drivingLicenseNumber: verification.licenseNumber,
        drivingLicenseExpiry: verification.expiryDate,
        address: input.address ?? null,
      };

      let customerId = contract.customerId;
      if (customerId) {
        await tx.customer.update({ where: { id: customerId }, data: customerData });
      } else {
        const created = await tx.customer.create({ data: customerData });
        customerId = created.id;
      }

      const activeLicense = await tx.contractDocument.findFirst({
        where: { contractId: contract.id, type: "DRIVING_LICENSE", supersededAt: null },
      });
      if (activeLicense) {
        await tx.customerDocument.createMany({
          data: [
            {
              customerId,
              type: "DRIVING_LICENSE",
              attachmentId: activeLicense.attachmentId,
            },
          ],
          skipDuplicates: true,
        });
      }

      const nextStatus = contract.status === "AWAITING" ? "FORM" : contract.status;
      if (contract.status === "AWAITING") assertTransition("AWAITING", "FORM");
      await tx.contract.update({
        where: { id: contract.id },
        data: { customerId, status: nextStatus, revision: { increment: 1 } },
      });
      if (contract.status === "AWAITING") {
        await emit(tx, "contract.form_completed", contract.id);
      }
      return loadPublicRental(tx, contract.id);
    });
  }

  async function acceptPublic(
    token: string,
    input: z.infer<typeof PublicAcceptSchema>,
    meta: { ip?: string; userAgent?: string },
  ) {
    return withTransaction(prisma, async (tx) => {
      const link = await resolveContractLink(tx, token, "RENTAL");
      const contract = await tx.contract.findUnique({
        where: { id: link.contractId },
        include: {
          vehicle: { include: { model: { select: { name: true } } } },
          customer: true,
        },
      });
      if (!contract) throw contractError.notFound();
      if (contract.status !== "FORM") throw contractError.notReadyForAcceptance();
      assertTransition(contract.status, "SIGNED");
      if (!contract.customer) throw contractError.publicFormIncomplete();

      const verification = await latestLicense(tx, contract.id);
      assertLicenseProgress(verification?.status, verification?.expiryDate);

      const snapshot = buildContractSnapshot({
        contractNumber: contract.contractNumber,
        customer: {
          ...contract.customer,
          drivingLicenseNumber: verification?.licenseNumber ?? contract.customer.drivingLicenseNumber,
          drivingLicenseExpiry: verification?.expiryDate ?? contract.customer.drivingLicenseExpiry,
        },
        vehicle: {
          vehicleName: contract.vehicle.vehicleName,
          plateNumber: contract.vehicle.plateNumber,
          modelYear: contract.vehicle.modelYear,
          color: contract.vehicle.color,
          vin: contract.vehicle.vin,
          modelName: contract.vehicle.model?.name ?? null,
        },
        commercial: {
          agreedAmount: contract.agreedAmount,
          priceType: contract.priceType,
          rentalDays: contract.rentalDays,
          startAt: contract.startAt,
          endAt: contract.endAt,
          depositAmount: contract.depositAmount,
          currency: contract.currency,
        },
      });

      await tx.contractAcceptance.create({
        data: {
          contractId: contract.id,
          acceptedAt: new Date(),
          ip: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
          termsVersion: input.termsVersion ?? CONTRACT_TERMS_VERSION,
          signatureAttachmentId: input.signatureAttachmentId ?? null,
        },
      });
      await tx.contract.update({
        where: { id: contract.id },
        data: {
          status: "SIGNED",
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          revision: { increment: 1 },
        },
      });
      await emit(tx, "contract.signed", contract.id);
      return loadPublicRental(tx, contract.id);
    });
  }

  async function carIn(token: string, input: z.infer<typeof CarInSchema>, idempotencyKey?: string) {
    assertEightAngles(input.photos);
    const run = async () =>
      withTransaction(prisma, async (tx) => {
        const link = await resolveContractLink(tx, token, "RETURN");
        const contract = await tx.contract.findUnique({
          where: { id: link.contractId },
          include: { carIn: true, carOut: true },
        });
        if (!contract) throw contractError.notFound();
        if (contract.status === "REVIEW" && contract.carIn) {
          return publicView(
            await tx.contract.findUniqueOrThrow({
              where: { id: contract.id },
              include: { vehicle: { include: { model: { select: { name: true } } } } },
            }),
          );
        }
        assertTransition(contract.status, "REVIEW");
        if (!contract.carOut) throw contractError.carOutRequired();

        const now = input.occurredAt ?? new Date();
        const row = await tx.contractCarIn.create({
          data: {
            contractId: contract.id,
            occurredAt: now,
            mileageIn: input.mileageIn,
            fuelIn: input.fuelIn,
            notes: input.notes ?? null,
          },
        });
        await tx.contractCarInPhoto.createMany({
          data: input.photos.map((p, i) => ({
            carInId: row.id,
            attachmentId: p.attachmentId,
            angle: p.angle,
            sortOrder: i,
          })),
        });
        await tx.contract.update({
          where: { id: contract.id },
          data: { status: "REVIEW", revision: { increment: 1 } },
        });
        await markLinkUsed(tx, link.id);
        await emit(tx, "contract.return_submitted", contract.id, { vehicleId: contract.vehicleId });
        return publicView(
          await tx.contract.findUniqueOrThrow({
            where: { id: contract.id },
            include: { vehicle: { include: { model: { select: { name: true } } } } },
          }),
        );
      });

    if (!idempotencyKey) return run();
    const outcome = await runIdempotent(
      prisma,
      {
        scope: `contract:car-in:${hashToken(token)}`,
        key: idempotencyKey,
        fingerprint: fingerprintIdempotentPayload({
          mileageIn: input.mileageIn,
          fuelIn: input.fuelIn,
          notes: input.notes ?? null,
          occurredAt: input.occurredAt?.toISOString() ?? null,
          photos: input.photos,
        }),
      },
      run,
    );
    if (outcome.deduped) return getPublic("RETURN", token);
    return outcome.result!;
  }

  async function reconcile(
    contractId: string,
    input: z.infer<typeof ReconcileSchema>,
    actorUserId: number,
  ) {
    return withTransaction(prisma, async (tx) => {
      const contract = await tx.contract.findUnique({
        where: { id: contractId },
        include: { carIn: true, reconciliation: true },
      });
      if (!contract) throw contractError.notFound();
      assertStatus(contract.status, "REVIEW");
      if (!contract.carIn) throw contractError.carInRequired();

      const chargesTotal = input.lines.reduce((sum, line) => sum + line.amount, 0);
      const depositAmount = contract.depositAmount ?? 0;
      const deductions = depositAmount;
      const finalAmount = chargesTotal - deductions;
      const now = new Date();

      if (contract.reconciliation) {
        await tx.contractReconciliationLine.deleteMany({
          where: { reconciliationId: contract.reconciliation.id },
        });
        await tx.contractReconciliation.update({
          where: { id: contract.reconciliation.id },
          data: {
            chargesTotal,
            depositAmount,
            deductions,
            finalAmount,
            approvedAt: now,
            approvedByUserId: actorUserId,
            lines: { create: input.lines },
          },
        });
      } else {
        await tx.contractReconciliation.create({
          data: {
            contractId,
            chargesTotal,
            depositAmount,
            deductions,
            finalAmount,
            approvedAt: now,
            approvedByUserId: actorUserId,
            lines: { create: input.lines },
          },
        });
      }
      return toDetail(
        await tx.contract.findUniqueOrThrow({
          where: { id: contractId },
          include: CONTRACT_DETAIL_INCLUDE,
        }),
      );
    });
  }

  async function close(contractId: string, actorUserId: number, idempotencyKey?: string) {
    const run = async () =>
      withTransaction(prisma, async (tx) => {
        const contract = await tx.contract.findUnique({
          where: { id: contractId },
          include: { carIn: true, reconciliation: true },
        });
        if (!contract) throw contractError.notFound();
        if (contract.status === "CLOSED") {
          return toDetail(
            await tx.contract.findUniqueOrThrow({
              where: { id: contractId },
              include: CONTRACT_DETAIL_INCLUDE,
            }),
          );
        }
        assertTransition(contract.status, "CLOSED");
        if (!contract.carIn) throw contractError.carInRequired();
        if (!contract.reconciliation?.approvedAt) throw contractError.reconciliationRequired();

        await assertVehicleFreeForRental(tx, contract.vehicleId, contract.id);
        const now = new Date();
        await tx.contract.update({
          where: { id: contractId },
          data: { status: "CLOSED", closedAt: now, revision: { increment: 1 } },
        });
        await tx.vehicle.update({
          where: { id: contract.vehicleId },
          data: { operationalStatus: "AVAILABLE" },
        });
        await emit(tx, "contract.closed", contractId, {
          vehicleId: contract.vehicleId,
          actorUserId,
        });
        return toDetail(
          await tx.contract.findUniqueOrThrow({
            where: { id: contractId },
            include: CONTRACT_DETAIL_INCLUDE,
          }),
        );
      });

    if (!idempotencyKey) return run();
    const outcome = await runIdempotent(
      prisma,
      {
        scope: `contract:close:${contractId}`,
        key: idempotencyKey,
        fingerprint: fingerprintIdempotentPayload({ action: "close" }),
      },
      run,
    );
    if (outcome.deduped) return get(contractId);
    return outcome.result!;
  }

  async function renew(
    contractId: string,
    input: z.infer<typeof RenewSchema>,
    actorUserId: number | null,
    idempotencyKey?: string,
  ) {
    const run = async () =>
      withTransaction(prisma, async (tx) => {
        const contract = await tx.contract.findUnique({ where: { id: contractId } });
        if (!contract) throw contractError.notFound();
        assertStatus(contract.status, "ACTIVE");
        await assertVehicleFreeForRental(tx, contract.vehicleId, contract.id);

        const previousEndAt = contract.endAt ?? derivedEndAt(contract.startAt, contract.rentalDays);
        const newEndAt = derivedEndAt(previousEndAt, input.additionalDays, previousEndAt);
        await tx.contractRenewal.create({
          data: {
            contractId,
            additionalDays: input.additionalDays,
            additionalAmount: input.additionalAmount,
            previousEndAt,
            newEndAt,
            approvedAt: new Date(),
            createdByUserId: actorUserId,
          },
        });
        await tx.contract.update({
          where: { id: contractId },
          data: {
            rentalDays: contract.rentalDays + input.additionalDays,
            agreedAmount: contract.agreedAmount + input.additionalAmount,
            endAt: newEndAt,
            revision: { increment: 1 },
          },
        });
        await emit(tx, "contract.renewed", contractId, { additionalDays: input.additionalDays });
        return toDetail(
          await tx.contract.findUniqueOrThrow({
            where: { id: contractId },
            include: CONTRACT_DETAIL_INCLUDE,
          }),
        );
      });

    if (!idempotencyKey) return run();
    const outcome = await runIdempotent(
      prisma,
      {
        scope: `contract:renew:${contractId}`,
        key: idempotencyKey,
        fingerprint: fingerprintIdempotentPayload({
          additionalDays: input.additionalDays,
          additionalAmount: input.additionalAmount,
        }),
      },
      run,
    );
    if (outcome.deduped) return get(contractId);
    return outcome.result!;
  }

  async function confirmRenewalPublic(token: string, input: z.infer<typeof RenewSchema>) {
    const link = await resolveContractLink(prisma, token, "RENEWAL");
    await renew(link.contractId, input, null);
    await markLinkUsed(prisma, link.id);
    return publicView(
      await prisma.contract.findUniqueOrThrow({
        where: { id: link.contractId },
        include: { vehicle: { include: { model: { select: { name: true } } } } },
      }),
    );
  }

  function publicView(row: {
    contractNumber: string;
    status: z.infer<typeof import("./contracts.schema").ContractStatusSchema>;
    priceType: z.infer<typeof import("./contracts.schema").ContractPriceTypeSchema>;
    rentalDays: number;
    agreedAmount: number;
    currency: string;
    startAt: Date | null;
    endAt: Date | null;
    depositAmount: number | null;
    termsVersion: string;
    vehicle: {
      vehicleName: string | null;
      plateNumber: string | null;
      color: string | null;
      modelYear: number | null;
      model: { name: string } | null;
    };
  }) {
    return {
      contractNumber: row.contractNumber,
      status: row.status,
      priceType: row.priceType,
      rentalDays: row.rentalDays,
      agreedAmount: row.agreedAmount,
      currency: row.currency,
      startAt: row.startAt,
      endAt: row.endAt,
      depositAmount: row.depositAmount,
      termsVersion: row.termsVersion,
      vehicle: {
        displayName: vehicleDisplayName({
          vehicleName: row.vehicle.vehicleName,
          modelName: row.vehicle.model?.name ?? null,
          modelYear: row.vehicle.modelYear,
          plateNumber: row.vehicle.plateNumber,
        }),
        plateNumber: row.vehicle.plateNumber,
        color: row.vehicle.color,
        modelYear: row.vehicle.modelYear,
      },
    };
  }

  async function uploadDrivingLicense(token: string, file: MultipartFile) {
    const preview = await resolveContractLink(prisma, token, "RENTAL");
    const existing = await prisma.contract.findUnique({ where: { id: preview.contractId } });
    if (!existing) throw contractError.notFound();
    if (existing.status !== "AWAITING" && existing.status !== "FORM") {
      throw contractError.invalidTransition(existing.status, existing.status);
    }

    const attachment = await files.save(file, null, {
      allowedMime: DRIVING_LICENSE_UPLOAD_MIME,
    });
    const bytes = await readFile(
      resolveStoragePath(env.FILE_STORAGE_DIR, (await prisma.attachment.findUniqueOrThrow({
        where: { id: attachment.id },
      })).storageKey),
    );

    return withTransaction(prisma, async (tx) => {
      const link = await resolveContractLink(tx, token, "RENTAL");
      await acquireAdvisoryLock(tx, CONTRACT_LICENSE_LOCK_NS, link.contractId);
      const contract = await tx.contract.findUnique({ where: { id: link.contractId } });
      if (!contract) throw contractError.notFound();
      if (contract.status !== "AWAITING" && contract.status !== "FORM") {
        throw contractError.invalidTransition(contract.status, contract.status);
      }

      await tx.contractDocument.updateMany({
        where: { contractId: contract.id, type: "DRIVING_LICENSE", supersededAt: null },
        data: { supersededAt: new Date() },
      });
      const document = await tx.contractDocument.create({
        data: {
          contractId: contract.id,
          type: "DRIVING_LICENSE",
          attachmentId: attachment.id,
        },
      });

      const ocr = await createDrivingLicenseOcrProvider().analyzeDrivingLicense({
        bytes,
        mimeType: attachment.mimeType,
      });
      const evaluated = evaluateDrivingLicenseOcr(
        ocr,
        new Date(),
        env.BUSINESS_TIMEZONE_OFFSET_MINUTES,
      );
      const verification = await tx.drivingLicenseVerification.create({
        data: {
          contractId: contract.id,
          documentId: document.id,
          attachmentId: attachment.id,
          status: evaluated.status,
          licenseNumber: evaluated.licenseNumber,
          expiryDate: evaluated.expiryDate,
          confidence: evaluated.confidence,
          provider: evaluated.provider,
          providerVersion: evaluated.providerVersion,
          verifiedAt: new Date(),
        },
      });
      await emit(tx, "contract.license_uploaded", contract.id, {
        documentId: document.id,
        dedupe: document.id,
      });
      await emit(tx, "contract.license_verified", contract.id, {
        verificationId: verification.id,
        status: verification.status,
        dedupe: verification.id,
      });
      return loadPublicRental(tx, contract.id);
    });
  }

  async function getPublicRental(token: string) {
    return withTransaction(prisma, async (tx) => {
      const link = await resolveContractLink(tx, token, "RENTAL", { allowCompleted: true });
      return loadPublicRental(tx, link.contractId);
    });
  }

  async function getPaymentContext(token: string) {
    return withTransaction(prisma, async (tx) => {
      const link = await resolveContractLink(tx, token, "RENTAL", { allowCompleted: true });
      const ctx = await loadPublicRental(tx, link.contractId);
      if (ctx.contract.status !== "SIGNED" && ctx.flow.step !== "PAYMENT" && ctx.flow.step !== "READY_FOR_HANDOVER") {
        throw contractError.paymentNotAllowed();
      }
      return {
        office: ctx.office,
        contractNumber: ctx.contract.contractNumber,
        vehicle: {
          displayName: ctx.vehicle.displayName,
          plateNumber: ctx.vehicle.plateNumber,
        },
        rentalDays: ctx.rental.rentalDays,
        agreedAmount: ctx.rental.agreedAmount,
        currency: ctx.rental.currency,
        payment: {
          status: ctx.payment.status,
          method: ctx.payment.method,
        },
        providerAvailable: ctx.payment.providerAvailable,
      };
    });
  }

  async function applyProviderPaymentStatus(
    tx: Parameters<Parameters<typeof withTransaction>[1]>[0],
    paymentId: string,
  ) {
    const payment = await tx.contractPayment.findUnique({ where: { id: paymentId } });
    if (!payment?.providerReference) return payment;
    if (payment.status !== "PENDING" && payment.status !== "PROCESSING") return payment;
    const result = await createPaymentProvider().getPaymentStatus(payment.providerReference);
    if (result.status === "UNKNOWN") return payment;
    if (result.status === "CONFIRMED") {
      const contract = await tx.contract.findUnique({ where: { id: payment.contractId } });
      if (!contract) throw contractError.notFound();
      await tx.contractPayment.update({
        where: { id: payment.id },
        data: {
          status: "CONFIRMED",
          providerStatus: result.providerStatus ?? "CONFIRMED",
          confirmedAt: new Date(),
        },
      });
      if (contract.status === "SIGNED") {
        assertTransition("SIGNED", "PAID");
        await assertVehicleFreeForRental(tx, contract.vehicleId, contract.id);
        await tx.contract.update({
          where: { id: contract.id },
          data: { status: "PAID", revision: { increment: 1 } },
        });
        await completeRentalLinks(tx, contract.id);
        await emit(tx, "payment.confirmed", contract.id, {
          paymentId: payment.id,
          dedupe: payment.id,
        });
        await emit(tx, "contract.paid", contract.id, { vehicleId: contract.vehicleId });
      }
      return tx.contractPayment.findUnique({ where: { id: payment.id } });
    }
    if (result.status === "FAILED" || result.status === "CANCELLED") {
      await tx.contractPayment.update({
        where: { id: payment.id },
        data: {
          status: result.status,
          providerStatus: result.providerStatus ?? result.status,
          failedAt: new Date(),
        },
      });
      await emit(tx, "payment.failed", payment.contractId, {
        paymentId: payment.id,
        status: result.status,
        dedupe: payment.id,
      });
    }
    return tx.contractPayment.findUnique({ where: { id: payment.id } });
  }

  async function startCardPayment(token: string, idempotencyKey?: string) {
    const provider = createPaymentProvider();
    if (!provider.configured) throw contractError.paymentProviderNotConfigured();

    const run = async () =>
      withTransaction(prisma, async (tx) => {
        const link = await resolveContractLink(tx, token, "RENTAL");
        await acquireAdvisoryLock(tx, CONTRACT_PAYMENT_LOCK_NS, link.contractId);
        const contract = await tx.contract.findUnique({ where: { id: link.contractId } });
        if (!contract) throw contractError.notFound();
        if (contract.status !== "SIGNED") throw contractError.paymentNotAllowed();
        if (contract.agreedAmount <= 0) throw contractError.paymentNotAllowed();

        const verification = await latestLicense(tx, contract.id);
        assertLicenseProgress(verification?.status, verification?.expiryDate);

        const active = await tx.contractPayment.findFirst({
          where: { contractId: contract.id, status: { in: ["PENDING", "PROCESSING"] } },
        });
        if (active) throw contractError.paymentAlreadyProcessing();

        const created = await provider.createPayment({
          contractId: contract.id,
          amount: contract.agreedAmount,
          currency: contract.currency,
        });
        if (!created.ok) throw contractError.paymentProviderNotConfigured();

        const statusToken = generateOpaqueToken(32);
        const payment = await tx.contractPayment.create({
          data: {
            contractId: contract.id,
            amount: contract.agreedAmount,
            currency: contract.currency,
            method: "CARD",
            status: "PROCESSING",
            provider: created.provider,
            providerReference: created.providerReference,
            providerStatus: created.providerStatus,
            processingStartedAt: new Date(),
            statusTokenHash: hashToken(statusToken),
            statusTokenExpiresAt: expiryFromNow(PAYMENT_STATUS_TOKEN_TTL_SECONDS),
          },
        });
        await emit(tx, "payment.started", contract.id, { paymentId: payment.id, dedupe: payment.id });
        await emit(tx, "payment.pending", contract.id, {
          paymentId: payment.id,
          dedupe: `${payment.id}:pending`,
        });
        return {
          payment: {
            status: payment.status,
            amount: payment.amount,
            currency: payment.currency,
            method: payment.method,
          },
          statusToken,
          providerAvailable: true,
        };
      });

    if (!idempotencyKey) return run();
    const outcome = await runIdempotent(
      prisma,
      {
        scope: `contract:card-payment:${hashToken(token)}`,
        key: idempotencyKey,
        fingerprint: fingerprintIdempotentPayload({ method: "CARD" }),
      },
      run,
    );
    if (outcome.deduped) {
      const link = await resolveContractLink(prisma, token, "RENTAL", { allowCompleted: true });
      const payment = await prisma.contractPayment.findFirst({
        where: { contractId: link.contractId, method: "CARD" },
        orderBy: { createdAt: "desc" },
      });
      if (!payment) throw contractError.paymentAttemptNotFound();
      return {
        payment: {
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          method: payment.method,
        },
        statusToken: null,
        providerAvailable: true,
      };
    }
    return outcome.result!;
  }

  async function getPaymentStatusByToken(statusToken: string) {
    const digest = hashToken(statusToken);
    return withTransaction(prisma, async (tx) => {
      const payment = await tx.contractPayment.findUnique({
        where: { statusTokenHash: digest },
      });
      if (!payment) throw contractError.paymentStatusTokenInvalid();
      if (!payment.statusTokenExpiresAt || payment.statusTokenExpiresAt.getTime() <= Date.now()) {
        throw contractError.paymentStatusTokenExpired();
      }
      const updated = (await applyProviderPaymentStatus(tx, payment.id)) ?? payment;
      const contract = await tx.contract.findUnique({
        where: { id: updated.contractId },
        select: { status: true },
      });
      return { status: updated.status, contractStatus: contract?.status ?? null };
    });
  }

  async function getPublic(type: "RENTAL" | "RETURN" | "RENEWAL", token: string) {
    return withTransaction(prisma, async (tx) => {
      const link = await resolveContractLink(tx, token, type);
      const contract = await tx.contract.findUnique({
        where: { id: link.contractId },
        include: { vehicle: { include: { model: { select: { name: true } } } } },
      });
      if (!contract) throw contractError.notFound();
      return publicView(contract);
    });
  }

  async function openInspectionStream(
    contractId: string,
    side: "out" | "in",
    photoId: string,
  ) {
    if (side === "out") {
      const photo = await prisma.contractCarOutPhoto.findFirst({
        where: { id: photoId, carOut: { contractId } },
        include: { attachment: true },
      });
      if (!photo) throw AppError.notFound("Contract photo not found");
      return {
        attachment: photo.attachment,
        stream: createReadStream(
          resolveStoragePath(env.FILE_STORAGE_DIR, photo.attachment.storageKey),
        ),
      };
    }
    const photo = await prisma.contractCarInPhoto.findFirst({
      where: { id: photoId, carIn: { contractId } },
      include: { attachment: true },
    });
    if (!photo) throw AppError.notFound("Contract photo not found");
    return {
      attachment: photo.attachment,
      stream: createReadStream(
        resolveStoragePath(env.FILE_STORAGE_DIR, photo.attachment.storageKey),
      ),
    };
  }

  return {
    createOffer,
    list,
    get,
    generateLink,
    confirmPayment,
    carOut,
    submitPublicForm,
    acceptPublic,
    carIn,
    reconcile,
    close,
    renew,
    confirmRenewalPublic,
    getPublic,
    getPublicRental,
    uploadDrivingLicense,
    getPaymentContext,
    startCardPayment,
    getPaymentStatusByToken,
    openInspectionStream,
  };
}
