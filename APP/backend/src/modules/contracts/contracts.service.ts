import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import type { ContractStatus, OfficialContractSignatureSlot } from "@prisma/client";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { AppError } from "src/lib/errors/app-error";
import { withTransaction, type Tx } from "src/lib/db/transaction";
import { writeOutboxEvent } from "src/lib/db/outbox";
import { runIdempotent, fingerprintIdempotentPayload } from "src/lib/db/idempotency";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { paginate, parseSort } from "src/lib/http/pagination";
import { normalizeEmail, normalizePhone } from "src/lib/security/normalize";
import { resolveStoragePath } from "src/lib/files/storage-key";
import { generateStorageKey } from "src/lib/files/storage-key";
import { env } from "src/config/env";
import { hashToken } from "src/lib/security/tokens";
import { vehicleDisplayName } from "src/modules/vehicles/vehicles.mapper";
import {
  CONTRACT_CURRENCY,
  CONTRACT_LICENSE_LOCK_NS,
  CONTRACT_PASSPORT_LOCK_NS,
  CONTRACT_OFFICIAL_REVIEW_LOCK_NS,
  CONTRACT_RECONCILE_LOCK_NS,
  CONTRACT_LIFECYCLE_LOCK_NS,
  CONTRACT_TERMS_VERSION,
  DRIVING_LICENSE_UPLOAD_MIME,
  INSPECTION_ANGLES,
  CAR_OUT_REQUIRED_ANGLES,
  OFFICE_DISPLAY_NAME_DEFAULT,
  PASSPORT_UPLOAD_MIME,
  VEHICLE_RENTAL_LOCK_NS,
} from "src/modules/contracts/contracts.constants";
import { allocateContractNumber } from "src/modules/contracts/contracts-number";
import { assertStatus, assertTransition } from "src/modules/contracts/contracts-status";
import { buildContractSnapshot } from "src/modules/contracts/contracts-snapshot";
import {
  completeReturnLinks,
  issueContractLink,
  markLinkUsed,
  resolveContractLink,
  revokeUnusedRenewalLinks,
} from "src/modules/contracts/contracts-links";
import { assertVehicleBookableForRental, assertVehicleFreeForRental, canCarOutFromState, findBlockingContract } from "src/modules/contracts/vehicle-rental-guard";
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
import {
  buildPublicFrontendUrl,
  type PublicFrontendLocale,
} from "src/lib/http/public-frontend-url";
import { createTarsWorkflowOrchestrator } from "src/modules/integrations/tars/tars-workflow.orchestrator";
import { tarsError } from "src/modules/integrations/tars/tars.errors";
import { evaluateDrivingLicenseOcr } from "src/modules/contracts/driving-license-policy";
import { analyzeDrivingLicenseDocument } from "src/modules/contracts/ocr/driving-license-ocr.adapter";
import { evaluatePassportOcr } from "src/modules/contracts/passport-extraction-policy";
import {
  buildContractIdentityDraft,
  toPublicIdentityDraft,
} from "src/modules/contracts/contract-identity-draft";
import { analyzeDocument } from "src/modules/document-ocr/document-ocr.service";
import { createSimulationDocumentOcrProvider } from "src/modules/document-ocr/simulation-document-ocr.provider";
import { derivedEndAt } from "src/modules/contracts/contracts-period";
import {
  buildOfficialContractView,
  OFFICIAL_CONTRACT_EDITABLE_FIELDS,
  OFFICIAL_CONTRACT_INCLUDE,
  OFFICIAL_CONTRACT_REVIEWABLE_STATUSES,
} from "src/modules/contracts/official-contract";
import type {
  OfficialContractReviewPatch,
  OfficialContractStaffTerms,
} from "src/modules/contracts/contracts.schema";
import {
  PUBLIC_SIGNABLE_SLOTS,
  readDamageMarks,
  SIGNATURE_UPLOAD_MIME,
} from "src/modules/contracts/official-contract-interactive";
import { createPaymentProvider, devPaymentSimulationEnabled, requiresCardSetupBeforeSigning } from "src/modules/contracts/payment/payment-provider.factory";
import { createContractPaymentService } from "src/modules/contracts/payment/contract-payment.service";
import { createFilesService } from "src/modules/files/files.service";
import type { MultipartFile } from "@fastify/multipart";
import type {
  CarInSchema,
  CarInDraftPatchSchema,
  CarInPhotoQuerySchema,
  CarOutSchema,
  CarOutDraftPatchSchema,
  CarOutPhotoQuerySchema,
  ConfirmPaymentSchema,
  ConfirmRoadLiabilityChargeSchema,
  CreateOfferInput,
  PublicAcceptSchema,
  PublicFormSchema,
  ReconcileSchema,
  RenewSchema,
} from "src/modules/contracts/contracts.schema";
import {
  isManualExternalReconLineType,
  reconciliationTotalsFromLines,
} from "src/modules/contracts/contracts-road-liability-charge";
import {
  buildRoadLiabilityChargeProposal,
  COLLECTIBLE_WHERE,
} from "src/modules/road-liabilities/road-liability.mapper";
import { createRoadLiabilityCustomerChargeService } from "src/modules/road-liabilities/road-liability-customer-charge.service";
import { loadSalikGpsSignals } from "src/modules/contracts/contract-road-liability-signals";
import type { z } from "zod";
import type { ListContractsQuerySchema } from "src/modules/contracts/contracts.schema";
import { carOutReadiness } from "src/modules/contracts/car-out-evidence";

const SORTABLE = ["createdAt", "contractNumber", "startAt", "endAt", "agreedAmount", "status"] as const;

const SIMULATION_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function assertEightAngles(photos: { angle: string }[]): void {
  const set = new Set(photos.map((p) => p.angle));
  if (photos.length !== 8 || set.size !== 8) {
    throw AppError.validation("Car inspection requires all 8 unique angles");
  }
  for (const angle of INSPECTION_ANGLES) {
    if (!set.has(angle)) throw AppError.validation("Car inspection requires all 8 unique angles");
  }
}

function assertCarOutAngles(photos: { angle: string }[]): void {
  const present = new Set(photos.map((photo) => photo.angle));
  if (photos.length < CAR_OUT_REQUIRED_ANGLES.length || present.size !== photos.length ||
    CAR_OUT_REQUIRED_ANGLES.some((angle) => !present.has(angle))) {
    throw AppError.validation("Car-Out requires all eight photo angles");
  }
}


type RenewalHistoryRow = {
  additionalDays: number;
  additionalAmount: number;
  previousEndAt: Date;
  newEndAt: Date;
  approvedAt: Date | null;
  appliedAt: Date | null;
};

function toPublicRenewal(row: RenewalHistoryRow) {
  return {
    additionalDays: row.additionalDays,
    additionalAmount: row.additionalAmount,
    previousEndAt: row.previousEndAt,
    newEndAt: row.newEndAt,
    confirmed: row.appliedAt != null,
    awaitingPayment:
      row.approvedAt != null && row.appliedAt == null && row.additionalAmount > 0,
  };
}

function pickPublicRenewal(renewals: RenewalHistoryRow[], preferConfirmed: boolean) {
  const pending = renewals.find((row) => row.approvedAt == null);
  if (!preferConfirmed && pending) return toPublicRenewal(pending);
  const awaitingPayment = renewals.find(
    (row) => row.approvedAt != null && row.appliedAt == null,
  );
  if (awaitingPayment) return toPublicRenewal(awaitingPayment);
  const latestApplied = renewals.find((row) => row.appliedAt != null);
  if (latestApplied) return toPublicRenewal(latestApplied);
  if (pending) return toPublicRenewal(pending);
  return null;
}

export function createContractsService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const files = createFilesService(fastify);
  const customerCharges = createRoadLiabilityCustomerChargeService(fastify);
  const paymentService = createContractPaymentService(prisma);
  const tars = createTarsWorkflowOrchestrator(fastify);

  function assertSimulationEnabled(): void {
    if (!devPaymentSimulationEnabled()) {
      throw AppError.forbidden("Development simulation is disabled");
    }
  }

  async function createSimulationAttachment(
    db: typeof prisma,
    originalName: string,
  ): Promise<string> {
    const storageKey = generateStorageKey(originalName);
    await mkdir(resolveStoragePath(env.FILE_STORAGE_DIR, ""), { recursive: true });
    await writeFile(resolveStoragePath(env.FILE_STORAGE_DIR, storageKey), SIMULATION_PNG);
    const attachment = await db.attachment.create({
      data: {
        originalName,
        storageKey,
        mimeType: "image/png",
        size: SIMULATION_PNG.length,
        checksum: createHash("sha256").update(SIMULATION_PNG).digest("hex"),
        uploadedById: null,
      },
    });
    return attachment.id;
  }

  async function decorateDetail(row: Awaited<ReturnType<typeof loadDetail>>, db: typeof prisma | Tx = prisma) {
    const signals = await loadSalikGpsSignals(db, [row.id]);
    const conflict = row.status === "PAID"
      ? await findBlockingContract(db, row.vehicleId, row.id)
      : null;
    const canCarOut = canCarOutFromState({
      status: row.status,
      vehicleId: row.vehicleId,
      vehicleActive: row.vehicle.isActive,
      vehicleStatus: row.vehicle.operationalStatus,
      hasCarOut: Boolean(row.carOut),
      hasConflictingContract: Boolean(conflict),
    });
    return toDetail(row, signals.get(row.id), canCarOut);
  }

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
    const base = toPublicRentalContext(row);
    const tarsOtpState = await tars.getOtpPublicState(id);
    return { ...base, tarsOtp: tarsOtpState };
  }

  async function resolvePublicRentalContractId(token: string, allowedStatuses?: ContractStatus[]) {
    return withTransaction(prisma, async (tx) => {
      const link = await resolveContractLink(tx, token, "RENTAL");
      const contract = await tx.contract.findUnique({
        where: { id: link.contractId },
        select: { id: true, status: true },
      });
      if (!contract) throw contractError.notFound();
      if (allowedStatuses && !allowedStatuses.includes(contract.status)) {
        throw contractError.officialContractReviewLocked();
      }
      return contract.id;
    });
  }

  async function requestPublicTarsOtp(token: string) {
    const contractId = await resolvePublicRentalContractId(token, ["AWAITING", "FORM"]);
    return tars.requestOtp(contractId);
  }

  async function verifyPublicTarsOtp(token: string, code: string) {
    const contractId = await resolvePublicRentalContractId(token, ["AWAITING", "FORM"]);
    return tars.verifyOtp(contractId, code);
  }

  async function latestLicense(tx: Parameters<Parameters<typeof withTransaction>[1]>[0], contractId: string) {
    return tx.drivingLicenseVerification.findFirst({
      where: { contractId },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Active passport attempt: its document has not been superseded by a retake. */
  async function activePassport(tx: Parameters<Parameters<typeof withTransaction>[1]>[0], contractId: string) {
    return tx.passportExtraction.findFirst({
      where: { contractId, document: { supersededAt: null } },
      orderBy: { createdAt: "desc" },
    });
  }

  async function identityDraftFor(tx: Parameters<Parameters<typeof withTransaction>[1]>[0], contractId: string) {
    const [license, passport] = await Promise.all([
      latestLicense(tx, contractId),
      activePassport(tx, contractId),
    ]);
    return buildContractIdentityDraft({ license, passport });
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
      await assertVehicleBookableForRental(tx, input.vehicleId);
      const contractNumber = await allocateContractNumber(tx);
      const created = await tx.contract.create({
        data: {
          contractNumber,
          vehicleId: input.vehicleId,
          // Historical ownership, derived server-side from the Vehicle that is
          // being rented. Never taken from the request, and never re-synced
          // afterwards: transferring the Vehicle must not re-brand this Contract.
          companyId: vehicle.companyId,
          customerId: input.customerId ?? null,
          createdByUserId: actorUserId,
          assignedEmployeeUserId: input.assignedEmployeeUserId ?? null,
          priceType: input.priceType,
          rentalDays: input.rentalDays,
          agreedAmount: input.agreedAmount,
          currency: CONTRACT_CURRENCY,
          startAt,
          endAt,
        },
      });
      await emit(tx, "contract.created", created.id, { vehicleId: input.vehicleId });
      return decorateDetail(
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
      // Contract.companyId, never vehicle.companyId: a transferred vehicle must
      // not move its old contracts into the other company's list.
      ...(query.companyId ? { companyId: query.companyId } : {}),
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
            company: { select: { id: true, code: true, displayName: true, accentColor: true } },
            vehicle: { include: { model: { select: { name: true } } } },
            customer: { select: { name: true } },
            carOut: { select: { id: true } },
            carIn: { select: { id: true } },
            carOutDraft: { select: {
              mileageOut: true, fuelOut: true, hirerSignatureAttachmentId: true,
              photos: { select: { angle: true } },
            } },
          },
          orderBy: { [field]: direction },
          skip,
          take,
        });
        const signals = await loadSalikGpsSignals(
          prisma,
          rows.map((row) => row.id),
        );
        const blocking = await prisma.contract.findMany({
          where: { vehicleId: { in: rows.map((row) => row.vehicleId) }, status: { in: ["PAID", "ACTIVE", "RETOUT"] } },
          select: { id: true, vehicleId: true },
        });
        const blockingByVehicle = new Map<number, string[]>();
        for (const item of blocking) {
          const ids = blockingByVehicle.get(item.vehicleId) ?? [];
          ids.push(item.id);
          blockingByVehicle.set(item.vehicleId, ids);
        }
        return rows.map((row) =>
          toListItem({
            ...row,
            hasSalikGpsSignal: signals.get(row.id)?.hasSalikGpsSignal ?? false,
            carOutStatus: row.carOut ? "COMPLETED" : row.carOutDraft
              ? carOutReadiness({
                mileageOut: row.carOutDraft.mileageOut,
                fuelOut: row.carOutDraft.fuelOut,
                hasSignature: Boolean(row.carOutDraft.hirerSignatureAttachmentId),
                photos: row.carOutDraft.photos,
              }).ready ? "READY" : "DRAFT" : "NOT_STARTED",
            canCarOut: canCarOutFromState({
              status: row.status,
              vehicleId: row.vehicleId,
              vehicleActive: row.vehicle.isActive,
              vehicleStatus: row.vehicle.operationalStatus,
              hasCarOut: Boolean(row.carOut),
              hasConflictingContract: (blockingByVehicle.get(row.vehicleId) ?? []).some((id) => id !== row.id),
            }),
          }),
        );
      },
    });
  }

  async function get(id: string) {
    return decorateDetail(await loadDetail(id));
  }

  async function generateLink(
    contractId: string,
    type: "RENTAL" | "RETURN" | "RENEWAL",
    actorUserId: number,
    offer?: z.infer<typeof RenewSchema>,
  ) {
    return withTransaction(prisma, async (tx) => {
      if (type !== "RENTAL") await acquireAdvisoryLock(tx, CONTRACT_LIFECYCLE_LOCK_NS, contractId);
      const contract = await tx.contract.findUnique({ where: { id: contractId } });
      if (!contract) throw contractError.notFound();
      if (contract.status === "CLOSED") throw contractError.alreadyClosed();

      if (type === "RENTAL" && !["AWAITING", "FORM", "SIGNED"].includes(contract.status)) {
        throw contractError.invalidTransition(contract.status, contract.status);
      }
      if (type === "RENTAL") {
        await assertVehicleBookableForRental(tx, contract.vehicleId, contract.id);
        const current = await tx.contract.findUnique({ where: { id: contractId }, select: { status: true } });
        if (!current || !["AWAITING", "FORM", "SIGNED"].includes(current.status)) {
          throw contractError.invalidTransition(current?.status ?? contract.status, contract.status);
        }
      }
      // Issuing a return link never moves the lifecycle: the contract stays ACTIVE
      // (renewal still possible) until the hirer confirms on the link itself.
      if (type === "RETURN") {
        if (contract.status !== "ACTIVE" && contract.status !== "RETOUT") {
          throw contractError.invalidTransition(contract.status, "RETOUT");
        }
      }
      if (type === "RENEWAL") {
        if (contract.status !== "ACTIVE") {
          throw contractError.invalidTransition(contract.status, "ACTIVE");
        }
        if (!offer) throw contractError.renewalOfferRequired();
        const previousEndAt = contract.endAt ?? derivedEndAt(contract.startAt, contract.rentalDays);
        const newEndAt = derivedEndAt(previousEndAt, offer.additionalDays, previousEndAt);
        await tx.contractRenewal.deleteMany({ where: { contractId, approvedAt: null } });
        await tx.contractRenewal.create({
          data: {
            contractId,
            additionalDays: offer.additionalDays,
            additionalAmount: offer.additionalAmount,
            previousEndAt,
            newEndAt,
            createdByUserId: actorUserId,
          },
        });
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
    _contractId: string,
    _input: z.infer<typeof ConfirmPaymentSchema>,
    _actorUserId: number,
    _idempotencyKey?: string,
  ): Promise<Awaited<ReturnType<typeof get>>> {
    throw contractError.manualPaymentDisabled();
  }

  /**
   * Stores the paper side of a custody event: structured damage marks on the
   * official contract diagrams and the hirer's custody signature (PNG).
   */
  async function persistCustodyPaper(
    tx: Tx,
    contractId: string,
    side: "OUT" | "IN",
    input: { damage?: z.infer<typeof CarOutSchema>["damage"]; hirerSignatureAttachmentId?: string },
  ) {
    if (input.damage !== undefined) {
      const marks = readDamageMarks(input.damage);
      const value = marks.length ? (marks as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
      const column = side === "OUT" ? "damageOut" : "damageIn";
      await tx.officialContractReviewDraft.upsert({
        where: { contractId },
        create: { contractId, [column]: value },
        update: { [column]: value, revision: { increment: 1 } },
      });
    }
    if (input.hirerSignatureAttachmentId) {
      const attachment = await tx.attachment.findUnique({
        where: { id: input.hirerSignatureAttachmentId },
        select: { id: true, mimeType: true },
      });
      if (!attachment || !(SIGNATURE_UPLOAD_MIME as readonly string[]).includes(attachment.mimeType)) {
        throw AppError.validation("Hirer signature must be a PNG attachment");
      }
      const slot = side === "OUT" ? "VEHICLE_OUT_HIRER" : "VEHICLE_IN_HIRER";
      const capturedAt = new Date();
      await tx.officialContractSignature.upsert({
        where: { contractId_slot: { contractId, slot } },
        create: { contractId, slot, attachmentId: attachment.id, capturedAt },
        update: { attachmentId: attachment.id, capturedAt },
      });
      await emit(tx, "contract.official_signature_captured", contractId, {
        slot,
        dedupe: `${slot}:${capturedAt.getTime()}`,
      });
    }
  }

  async function assertCarOutDraftEligible(tx: Tx, contractId: string) {
    const initial = await tx.contract.findUnique({ where: { id: contractId }, select: { vehicleId: true } });
    if (!initial) throw contractError.notFound();
    await assertVehicleFreeForRental(tx, initial.vehicleId, contractId);
    const contract = await tx.contract.findUnique({
      where: { id: contractId },
      include: { vehicle: { select: { isActive: true, operationalStatus: true } }, carOut: { select: { id: true } } },
    });
    if (!contract) throw contractError.notFound();
    if (!canCarOutFromState({
      status: contract.status, vehicleId: contract.vehicleId,
      vehicleActive: contract.vehicle.isActive, vehicleStatus: contract.vehicle.operationalStatus,
      hasCarOut: Boolean(contract.carOut), hasConflictingContract: false,
    })) throw contractError.invalidTransition(contract.status, "ACTIVE");
    return contract;
  }

  async function validateOutAttachment(tx: Tx, attachmentId: string, signature = false) {
    const attachment = await tx.attachment.findUnique({
      where: { id: attachmentId }, select: { mimeType: true, size: true },
    });
    const allowed = signature ? attachment?.mimeType === "image/png"
      : attachment?.mimeType === "image/png" || attachment?.mimeType === "image/jpeg";
    if (!attachment || !allowed || attachment.size > env.MAX_UPLOAD_SIZE) {
      throw AppError.validation(signature ? "OUT signature must be a valid PNG attachment" : "OUT photo must be a valid image attachment");
    }
  }

  async function saveCarOutDraft(contractId: string, input: z.infer<typeof CarOutDraftPatchSchema>) {
    await withTransaction(prisma, async (tx) => {
      await assertCarOutDraftEligible(tx, contractId);
      const signedMarks = await tx.officialContractReviewDraft.findUnique({
        where: { contractId }, select: { damageOut: true },
      });
      if (input.hirerSignatureAttachmentId) {
        await validateOutAttachment(tx, input.hirerSignatureAttachmentId, true);
      }
      const data = {
        ...(input.mileageOut !== undefined ? { mileageOut: input.mileageOut } : {}),
        ...(input.fuelOut !== undefined ? { fuelOut: input.fuelOut } : {}),
        ...(input.damageOut !== undefined ? { damageOut: readDamageMarks(input.damageOut) as unknown as Prisma.InputJsonValue } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.hirerSignatureAttachmentId !== undefined
          ? { hirerSignatureAttachmentId: input.hirerSignatureAttachmentId } : {}),
      };
      await tx.contractCarOutDraft.upsert({
        where: { contractId },
        create: {
          contractId,
          damageOut: readDamageMarks(signedMarks?.damageOut) as unknown as Prisma.InputJsonValue,
          ...data,
        },
        update: data,
      });
    });
    return (await get(contractId)).carOutHandover;
  }

  async function uploadCarOutPhoto(contractId: string, angle: z.infer<typeof CarOutPhotoQuerySchema>["angle"], file: MultipartFile, actorUserId: number) {
    await withTransaction(prisma, (tx) => assertCarOutDraftEligible(tx, contractId));
    const attachment = await files.save(file, actorUserId, { allowedMime: ["image/png", "image/jpeg"] });
    try {
      await withTransaction(prisma, async (tx) => {
        await assertCarOutDraftEligible(tx, contractId);
        const draft = await tx.contractCarOutDraft.upsert({
          where: { contractId }, create: { contractId }, update: {},
        });
        await tx.contractCarOutDraftPhoto.upsert({
          where: { carOutDraftId_angle: { carOutDraftId: draft.id, angle } },
          create: { carOutDraftId: draft.id, attachmentId: attachment.id, angle },
          update: { attachmentId: attachment.id },
        });
      });
    } catch (error) {
      await files.remove(attachment.id).catch(() => undefined);
      throw error;
    }
    return (await get(contractId)).carOutHandover;
  }

  async function uploadCarOutSignature(contractId: string, file: MultipartFile, actorUserId: number) {
    await withTransaction(prisma, (tx) => assertCarOutDraftEligible(tx, contractId));
    const attachment = await files.save(file, actorUserId, { allowedMime: SIGNATURE_UPLOAD_MIME });
    try {
      await withTransaction(prisma, async (tx) => {
        await assertCarOutDraftEligible(tx, contractId);
        await tx.contractCarOutDraft.upsert({
          where: { contractId },
          create: { contractId, hirerSignatureAttachmentId: attachment.id },
          update: { hirerSignatureAttachmentId: attachment.id },
        });
      });
    } catch (error) {
      await files.remove(attachment.id).catch(() => undefined);
      throw error;
    }
    return (await get(contractId)).carOutHandover;
  }

  async function openCarOutSignatureStream(contractId: string) {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { carOut: { select: { hirerSignatureAttachmentId: true } },
        carOutDraft: { select: { hirerSignatureAttachmentId: true } } },
    });
    if (!contract) throw contractError.notFound();
    const id = contract.carOut?.hirerSignatureAttachmentId ?? contract.carOutDraft?.hirerSignatureAttachmentId;
    if (!id) throw AppError.notFound("Car-Out signature not found");
    return files.openDownload(id);
  }

  async function deleteCarOutPhoto(contractId: string, photoId: string) {
    await withTransaction(prisma, async (tx) => {
      await assertCarOutDraftEligible(tx, contractId);
      const deleted = await tx.contractCarOutDraftPhoto.deleteMany({
        where: { id: photoId, carOutDraft: { contractId } },
      });
      if (!deleted.count) throw AppError.notFound("Car-Out photo not found");
    });
    return (await get(contractId)).carOutHandover;
  }

  /**
   * Staged Car-In draft eligibility, mirroring `assertCarOutDraftEligible`.
   * Entry rule: Contract = RETOUT, Vehicle = RENTED, no final Car-In yet, and
   * Car-Out must already exist. Draft work never changes Contract or Vehicle status.
   */
  async function assertCarInDraftEligible(tx: Tx, contractId: string) {
    const contract = await tx.contract.findUnique({
      where: { id: contractId },
      include: {
        vehicle: { select: { operationalStatus: true } },
        carIn: { select: { id: true } },
        carOut: { select: { id: true } },
      },
    });
    if (!contract) throw contractError.notFound();
    if (contract.status !== "RETOUT" || contract.carIn) {
      throw contractError.invalidTransition(contract.status, "REVIEW");
    }
    if (!contract.carOut) throw contractError.carOutRequired();
    if (contract.vehicle.operationalStatus !== "RENTED") throw contractError.vehicleNotRented();
    return contract;
  }

  async function validateInAttachment(tx: Tx, attachmentId: string, signature = false) {
    const attachment = await tx.attachment.findUnique({
      where: { id: attachmentId }, select: { mimeType: true, size: true },
    });
    const allowed = signature ? attachment?.mimeType === "image/png"
      : attachment?.mimeType === "image/png" || attachment?.mimeType === "image/jpeg";
    if (!attachment || !allowed || attachment.size > env.MAX_UPLOAD_SIZE) {
      throw AppError.validation(signature ? "IN signature must be a valid PNG attachment" : "IN photo must be a valid image attachment");
    }
  }

  async function saveCarInDraft(contractId: string, input: z.infer<typeof CarInDraftPatchSchema>) {
    await withTransaction(prisma, async (tx) => {
      await assertCarInDraftEligible(tx, contractId);
      const signedMarks = await tx.officialContractReviewDraft.findUnique({
        where: { contractId }, select: { damageIn: true },
      });
      const data = {
        ...(input.mileageIn !== undefined ? { mileageIn: input.mileageIn } : {}),
        ...(input.fuelIn !== undefined ? { fuelIn: input.fuelIn } : {}),
        ...(input.damageIn !== undefined ? { damageIn: readDamageMarks(input.damageIn) as unknown as Prisma.InputJsonValue } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      };
      await tx.contractCarInDraft.upsert({
        where: { contractId },
        create: {
          contractId,
          damageIn: readDamageMarks(signedMarks?.damageIn) as unknown as Prisma.InputJsonValue,
          ...data,
        },
        update: data,
      });
    });
    return (await get(contractId)).carInHandover;
  }

  async function uploadCarInPhoto(contractId: string, angle: z.infer<typeof CarInPhotoQuerySchema>["angle"], file: MultipartFile, actorUserId: number) {
    await withTransaction(prisma, (tx) => assertCarInDraftEligible(tx, contractId));
    const attachment = await files.save(file, actorUserId, { allowedMime: ["image/png", "image/jpeg"] });
    try {
      await withTransaction(prisma, async (tx) => {
        await assertCarInDraftEligible(tx, contractId);
        const draft = await tx.contractCarInDraft.upsert({
          where: { contractId }, create: { contractId }, update: {},
        });
        await tx.contractCarInDraftPhoto.upsert({
          where: { carInDraftId_angle: { carInDraftId: draft.id, angle } },
          create: { carInDraftId: draft.id, attachmentId: attachment.id, angle },
          update: { attachmentId: attachment.id },
        });
      });
    } catch (error) {
      await files.remove(attachment.id).catch(() => undefined);
      throw error;
    }
    return (await get(contractId)).carInHandover;
  }

  async function uploadCarInSignature(contractId: string, file: MultipartFile, actorUserId: number) {
    await withTransaction(prisma, (tx) => assertCarInDraftEligible(tx, contractId));
    const attachment = await files.save(file, actorUserId, { allowedMime: SIGNATURE_UPLOAD_MIME });
    try {
      await withTransaction(prisma, async (tx) => {
        await assertCarInDraftEligible(tx, contractId);
        await tx.contractCarInDraft.upsert({
          where: { contractId },
          create: { contractId, hirerSignatureAttachmentId: attachment.id },
          update: { hirerSignatureAttachmentId: attachment.id },
        });
      });
    } catch (error) {
      await files.remove(attachment.id).catch(() => undefined);
      throw error;
    }
    return (await get(contractId)).carInHandover;
  }

  /**
   * The draft row is never deleted on completion (same as Car-Out's draft), so
   * this keeps working for the final, immutable signature too. `ContractCarIn`
   * itself carries no signature column by design — see contracts.prisma.
   */
  async function openCarInSignatureStream(contractId: string) {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { carInDraft: { select: { hirerSignatureAttachmentId: true } } },
    });
    if (!contract) throw contractError.notFound();
    const id = contract.carInDraft?.hirerSignatureAttachmentId;
    if (!id) throw AppError.notFound("Car-In signature not found");
    return files.openDownload(id);
  }

  async function deleteCarInPhoto(contractId: string, photoId: string) {
    await withTransaction(prisma, async (tx) => {
      await assertCarInDraftEligible(tx, contractId);
      const deleted = await tx.contractCarInDraftPhoto.deleteMany({
        where: { id: photoId, carInDraft: { contractId } },
      });
      if (!deleted.count) throw AppError.notFound("Car-In photo not found");
    });
    return (await get(contractId)).carInHandover;
  }

  /**
   * Completes the staged Car-In draft: RETOUT -> REVIEW, Vehicle RENTED -> AVAILABLE.
   * Reads the persisted draft only — there is no body-supplied override, unlike
   * `carOut()`. This is the one authoritative staff completion path; the legacy
   * `POST /contracts/:id/car-in` route now delegates here too (see routes/admin).
   */
  async function completeCarInStaff(contractId: string, idempotencyKey?: string) {
    const run = async () =>
      withTransaction(prisma, async (tx) => {
        const initial = await tx.contract.findUnique({ where: { id: contractId }, select: { vehicleId: true } });
        if (!initial) throw contractError.notFound();
        await acquireAdvisoryLock(tx, VEHICLE_RENTAL_LOCK_NS, initial.vehicleId);

        const contract = await tx.contract.findUnique({
          where: { id: contractId },
          include: {
            carIn: { select: { id: true } },
            carOut: { select: { id: true } },
            vehicle: { select: { operationalStatus: true } },
            carInDraft: { include: { photos: true } },
          },
        });
        if (!contract) throw contractError.notFound();
        if (contract.status === "REVIEW" && contract.carIn) {
          return decorateDetail(
            await tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: CONTRACT_DETAIL_INCLUDE }),
            tx,
          );
        }
        assertTransition(contract.status, "REVIEW");
        if (!contract.carOut) throw contractError.carOutRequired();
        if (contract.vehicle.operationalStatus !== "RENTED") throw contractError.vehicleNotRented();

        const draft = contract.carInDraft;
        const mileageIn = draft?.mileageIn ?? null;
        const fuelIn = draft?.fuelIn ?? null;
        const signatureId = draft?.hirerSignatureAttachmentId ?? null;
        const photos = draft?.photos ?? [];
        if (mileageIn === null || !Number.isInteger(mileageIn) || mileageIn < 0) {
          throw AppError.validation("Valid IN mileage is required");
        }
        if (!fuelIn) throw AppError.validation("IN fuel is required");
        if (!signatureId) throw AppError.validation("Hirer IN signature is required");
        await validateInAttachment(tx, signatureId, true);
        assertCarOutAngles(photos);
        for (const photo of photos) await validateInAttachment(tx, photo.attachmentId);

        const signedMarks = await tx.officialContractReviewDraft.findUnique({
          where: { contractId }, select: { damageIn: true },
        });
        const damageIn = readDamageMarks(draft?.damageIn ?? signedMarks?.damageIn);

        const now = new Date();
        const carInRow = await tx.contractCarIn.create({
          data: {
            contractId,
            occurredAt: now,
            mileageIn,
            fuelIn,
            notes: draft?.notes ?? null,
          },
        });
        await tx.contractCarInPhoto.createMany({
          data: photos.map((p, i) => ({
            carInId: carInRow.id,
            attachmentId: p.attachmentId,
            angle: p.angle,
            sortOrder: i,
          })),
        });
        await persistCustodyPaper(tx, contractId, "IN", {
          damage: damageIn, hirerSignatureAttachmentId: signatureId,
        });
        await tx.contract.update({
          where: { id: contractId },
          data: { status: "REVIEW", revision: { increment: 1 } },
        });
        await tx.vehicle.update({
          where: { id: contract.vehicleId },
          data: { operationalStatus: "AVAILABLE" },
        });
        await completeReturnLinks(tx, contractId);
        await emit(tx, "contract.return_submitted", contractId, { vehicleId: contract.vehicleId });
        return decorateDetail(
          await tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: CONTRACT_DETAIL_INCLUDE }),
          tx,
        );
      });

    if (!idempotencyKey) return run();
    const outcome = await runIdempotent(
      prisma,
      {
        scope: `contract:car-in-complete:${contractId}`,
        key: idempotencyKey,
        fingerprint: fingerprintIdempotentPayload({ mode: "complete-from-draft" }),
      },
      run,
    );
    if (outcome.deduped) return get(contractId);
    return outcome.result!;
  }

  async function carOut(
    contractId: string,
    input: z.infer<typeof CarOutSchema> | undefined,
    actorUserId: number,
    idempotencyKey?: string,
  ) {
    if (input) assertCarOutAngles(input.photos);
    const run = async () =>
      withTransaction(prisma, async (tx) => {
        const contract = await tx.contract.findUnique({
          where: { id: contractId },
          include: { carOut: true },
        });
        if (!contract) throw contractError.notFound();
        if (contract.status === "ACTIVE" && contract.carOut) {
          return decorateDetail(
            await tx.contract.findUniqueOrThrow({
              where: { id: contractId },
              include: CONTRACT_DETAIL_INCLUDE,
            }),
          );
        }
        await assertVehicleFreeForRental(tx, contract.vehicleId, contract.id);
        const locked = await tx.contract.findUnique({ where: { id: contractId }, include: { carOut: true } });
        if (!locked) throw contractError.notFound();
        if (locked.status === "ACTIVE" && locked.carOut) {
          return decorateDetail(await tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: CONTRACT_DETAIL_INCLUDE }), tx);
        }
        assertTransition(locked.status, "ACTIVE");
        const vehicle = await tx.vehicle.findUnique({ where: { id: locked.vehicleId }, select: { isActive: true, operationalStatus: true } });
        if (!canCarOutFromState({
          status: locked.status,
          vehicleId: locked.vehicleId,
          vehicleActive: vehicle?.isActive ?? false,
          vehicleStatus: vehicle?.operationalStatus ?? null,
          hasCarOut: Boolean(locked.carOut),
          hasConflictingContract: false,
        })) throw contractError.vehicleNotAvailable();

        const confirmed = await tx.contractPayment.findFirst({
          where: { contractId, purpose: "RENTAL", status: "CONFIRMED" },
        });
        if (!confirmed) throw contractError.paymentRequired();
        const draft = input ? null : await tx.contractCarOutDraft.findUnique({
          where: { contractId }, include: { photos: true },
        });
        const mileageOut = input?.mileageOut ?? draft?.mileageOut ?? null;
        const fuelOut = input?.fuelOut ?? draft?.fuelOut ?? null;
        const signatureId = input?.hirerSignatureAttachmentId ?? draft?.hirerSignatureAttachmentId ?? null;
        const photos = input?.photos ?? draft?.photos ?? [];
        const signedMarks = await tx.officialContractReviewDraft.findUnique({
          where: { contractId }, select: { damageOut: true },
        });
        const damageOut = readDamageMarks(input?.damage ?? draft?.damageOut ?? signedMarks?.damageOut);
        if (mileageOut === null || !Number.isInteger(mileageOut) || mileageOut < 0) {
          throw AppError.validation("Valid OUT mileage is required");
        }
        if (!fuelOut) throw AppError.validation("OUT fuel is required");
        assertCarOutAngles(photos);
        if (!signatureId) throw AppError.validation("Hirer OUT signature is required");
        await validateOutAttachment(tx, signatureId, true);
        for (const photo of photos) await validateOutAttachment(tx, photo.attachmentId);

        const now = new Date();
        const carOutRow = await tx.contractCarOut.create({
          data: {
            contractId,
            performedByUserId: actorUserId,
            occurredAt: now,
            mileageOut,
            fuelOut,
            notes: input?.notes ?? draft?.notes ?? null,
            vehicleId: locked.vehicleId,
            damageOut: damageOut as unknown as Prisma.InputJsonValue,
            hirerSignatureAttachmentId: signatureId,
          },
        });
        await tx.contractCarOutPhoto.createMany({
          data: photos.map((p, i) => ({
            carOutId: carOutRow.id,
            attachmentId: p.attachmentId,
            angle: p.angle,
            sortOrder: i,
          })),
        });
        await persistCustodyPaper(tx, contractId, "OUT", {
          damage: damageOut, hirerSignatureAttachmentId: signatureId,
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
        return decorateDetail(
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
          input: input ?? { mode: "saved-draft" },
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
        include: { company: { select: { code: true, displayName: true, legalNameAr: true, legalNameEn: true } }, vehicle: { include: { model: { select: { name: true } } } } },
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
      if (!(await identityDraftFor(tx, contract.id)).identityReady) {
        throw contractError.identityNotReady();
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

  async function persistCarIn(
    tx: Tx,
    contract: {
      id: string;
      status: ContractStatus;
      vehicleId: number;
      carIn: { id: string } | null;
      carOut: { id: string } | null;
    },
    input: z.infer<typeof CarInSchema>,
  ): Promise<"created" | "existing"> {
    if (contract.status === "REVIEW" && contract.carIn) return "existing";
    assertTransition(contract.status, "REVIEW");
    if (!contract.carOut) throw contractError.carOutRequired();

    await acquireAdvisoryLock(tx, VEHICLE_RENTAL_LOCK_NS, contract.vehicleId);
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
    await persistCustodyPaper(tx, contract.id, "IN", input);
    await tx.contract.update({
      where: { id: contract.id },
      data: { status: "REVIEW", revision: { increment: 1 } },
    });
    const vehicle = await tx.vehicle.findUnique({
      where: { id: contract.vehicleId },
      select: { operationalStatus: true },
    });
    if (vehicle?.operationalStatus === "RENTED") {
      await tx.vehicle.update({
        where: { id: contract.vehicleId },
        data: { operationalStatus: "AVAILABLE" },
      });
    }
    await emit(tx, "contract.return_submitted", contract.id, { vehicleId: contract.vehicleId });
    return "created";
  }

  async function carIn(token: string, input: z.infer<typeof CarInSchema>, idempotencyKey?: string) {
    assertEightAngles(input.photos);
    const run = async () =>
      withTransaction(prisma, async (tx) => {
        const link = await resolveContractLink(tx, token, "RETURN", {
          allowCompleted: true,
        });
        const contract = await tx.contract.findUnique({
          where: { id: link.contractId },
          include: { carIn: true, carOut: true },
        });
        if (!contract) throw contractError.notFound();
        const outcome = await persistCarIn(tx, contract, input);
        if (outcome === "created") await markLinkUsed(tx, link.id);
        return publicView(
          await tx.contract.findUniqueOrThrow({
            where: { id: contract.id },
            include: { company: { select: { code: true, displayName: true, legalNameAr: true, legalNameEn: true } }, vehicle: { include: { model: { select: { name: true } } } } },
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
          damage: input.damage ?? null,
          hirerSignatureAttachmentId: input.hirerSignatureAttachmentId ?? null,
        }),
      },
      run,
    );
    if (outcome.deduped) return getPublic("RETURN", token);
    return outcome.result!;
  }

  async function carInStaff(
    contractId: string,
    input: z.infer<typeof CarInSchema>,
    idempotencyKey?: string,
  ) {
    assertEightAngles(input.photos);
    const run = async () =>
      withTransaction(prisma, async (tx) => {
        const contract = await tx.contract.findUnique({
          where: { id: contractId },
          include: { carIn: true, carOut: true },
        });
        if (!contract) throw contractError.notFound();
        const outcome = await persistCarIn(tx, contract, input);
        if (outcome === "created") await completeReturnLinks(tx, contract.id);
        return decorateDetail(
          await tx.contract.findUniqueOrThrow({
            where: { id: contract.id },
            include: CONTRACT_DETAIL_INCLUDE,
          }),
        );
      });

    if (!idempotencyKey) return run();
    const outcome = await runIdempotent(
      prisma,
      {
        scope: `contract:car-in-staff:${contractId}`,
        key: idempotencyKey,
        fingerprint: fingerprintIdempotentPayload({
          mileageIn: input.mileageIn,
          fuelIn: input.fuelIn,
          notes: input.notes ?? null,
          occurredAt: input.occurredAt?.toISOString() ?? null,
          photos: input.photos,
          damage: input.damage ?? null,
          hirerSignatureAttachmentId: input.hirerSignatureAttachmentId ?? null,
        }),
      },
      run,
    );
    if (outcome.deduped) return get(contractId);
    return outcome.result!;
  }

  async function detailFromTx(tx: Tx, contractId: string) {
    return decorateDetail(
      await tx.contract.findUniqueOrThrow({
        where: { id: contractId },
        include: CONTRACT_DETAIL_INCLUDE,
      }),
      tx,
    );
  }

  async function reconcile(
    contractId: string,
    input: z.infer<typeof ReconcileSchema>,
    actorUserId: number,
  ) {
    for (const line of input.lines) {
      if (isManualExternalReconLineType(line.type)) {
        throw contractError.roadLiabilityRequired();
      }
    }
    return withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, CONTRACT_RECONCILE_LOCK_NS, contractId);
      const contract = await tx.contract.findUnique({
        where: { id: contractId },
        include: { carIn: true, reconciliation: true },
      });
      if (!contract) throw contractError.notFound();
      assertStatus(contract.status, "REVIEW");
      if (!contract.carIn) throw contractError.carInRequired();

      const preservedLiabilityLines = contract.reconciliation
        ? await tx.contractReconciliationLine.findMany({
            where: { reconciliationId: contract.reconciliation.id, roadLiabilityId: { not: null } },
          })
        : [];
      const totals = reconciliationTotalsFromLines([
        ...preservedLiabilityLines,
        ...input.lines,
      ]);
      const now = new Date();

      if (contract.reconciliation) {
        await tx.contractReconciliationLine.deleteMany({
          where: { reconciliationId: contract.reconciliation.id, roadLiabilityId: null },
        });
        await tx.contractReconciliation.update({
          where: { id: contract.reconciliation.id },
          data: {
            ...totals,
            depositAmount: 0,
            deductions: 0,
            approvedAt: now,
            approvedByUserId: actorUserId,
            lines: { create: input.lines },
          },
        });
      } else {
        await tx.contractReconciliation.create({
          data: {
            contractId,
            ...totals,
            depositAmount: 0,
            deductions: 0,
            approvedAt: now,
            approvedByUserId: actorUserId,
            lines: { create: input.lines },
          },
        });
      }
      return detailFromTx(tx, contractId);
    });
  }

  async function listReconciliationRoadLiabilities(contractId: string) {
    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw contractError.notFound();

    const [availableRows, attachedRows] = await Promise.all([
      prisma.roadLiability.findMany({
        where: {
          ...COLLECTIBLE_WHERE,
          attributedContractId: contractId,
          reconciliationLine: { is: null },
        },
        include: {
          vehicle: { include: { model: { select: { name: true } } } },
          observations: { select: { sourceKey: true } },
        },
        orderBy: { occurredAt: "asc" },
      }),
      prisma.contractReconciliationLine.findMany({
        where: {
          reconciliation: { contractId },
          roadLiabilityId: { not: null },
        },
        include: { roadLiability: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return {
      available: availableRows.flatMap((row) => {
        if (row.amount == null || !row.currency) return [];
        const proposal = buildRoadLiabilityChargeProposal({ amount: row.amount });
        return [
          {
            id: row.id,
            type: row.type,
            sourceKey: row.authoritativeSourceKey,
            occurredAt: row.occurredAt,
            officialAmount: proposal.officialAmount,
            currency: row.currency,
            suggestedCustomerChargeAmount: proposal.suggestedCustomerChargeAmount,
            minimumCustomerChargeAmount: proposal.minimumCustomerChargeAmount,
            externalReference: row.authoritativeExternalReference,
            locationLabel: row.locationLabel,
            predictedByGps: row.observations.some((observation) => observation.sourceKey === "GPS_INFERENCE"),
            vehicle: row.vehicle
              ? {
                  id: row.vehicle.id,
                  displayName: vehicleDisplayName({
                    vehicleName: row.vehicle.vehicleName,
                    modelName: row.vehicle.model?.name ?? null,
                    modelYear: row.vehicle.modelYear,
                    plateNumber: row.vehicle.plateNumber,
                  }),
                  plateNumber: row.vehicle.plateNumber,
                }
              : null,
          },
        ];
      }),
      attached: attachedRows.flatMap((line) => {
        const liability = line.roadLiability;
        if (!liability || !line.roadLiabilityId) return [];
        return [
          {
            roadLiabilityId: line.roadLiabilityId,
            reconciliationLineId: line.id,
            type: liability.type,
            sourceKey: liability.authoritativeSourceKey,
            occurredAt: liability.occurredAt,
            officialAmount: line.officialAmountSnapshot ?? liability.amount ?? 0,
            customerChargeAmount: line.amount,
            adjustmentAmount: line.adjustmentAmount ?? 0,
            adjustmentReason: line.adjustmentReason,
            adjustmentNote: line.adjustmentNote,
            locked: true as const,
          },
        ];
      }),
    };
  }

  async function confirmRoadLiabilityCharge(
    contractId: string,
    roadLiabilityId: string,
    input: z.infer<typeof ConfirmRoadLiabilityChargeSchema>,
    actorUserId: number,
    idempotencyKey?: string,
  ) {
    await customerCharges.confirmForContract(
      contractId,
      roadLiabilityId,
      input,
      actorUserId,
      idempotencyKey,
    );
    return get(contractId);
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
          return decorateDetail(
            await tx.contract.findUniqueOrThrow({
              where: { id: contractId },
              include: CONTRACT_DETAIL_INCLUDE,
            }),
          );
        }
        assertTransition(contract.status, "CLOSED");
        if (!contract.carIn) throw contractError.carInRequired();
        if (!contract.reconciliation?.approvedAt) throw contractError.reconciliationRequired();
        if (
          contract.reconciliation.finalAmount > 0 &&
          !contract.reconciliation.settledAt
        ) {
          throw contractError.reconciliationPaymentRequired();
        }

        const now = new Date();
        await tx.contract.update({
          where: { id: contractId },
          data: { status: "CLOSED", closedAt: now, revision: { increment: 1 } },
        });
        await emit(tx, "contract.closed", contractId, {
          vehicleId: contract.vehicleId,
          actorUserId,
        });
        return decorateDetail(
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
        await acquireAdvisoryLock(tx, CONTRACT_LIFECYCLE_LOCK_NS, contractId);
        const contract = await tx.contract.findUnique({ where: { id: contractId } });
        if (!contract) throw contractError.notFound();
        assertStatus(contract.status, "ACTIVE");
        await assertVehicleFreeForRental(tx, contract.vehicleId, contract.id);

        const previousEndAt = contract.endAt ?? derivedEndAt(contract.startAt, contract.rentalDays);
        const newEndAt = derivedEndAt(previousEndAt, input.additionalDays, previousEndAt);
        await tx.contractRenewal.deleteMany({ where: { contractId, appliedAt: null } });
        await revokeUnusedRenewalLinks(tx, contractId);
        const renewal = await tx.contractRenewal.create({
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
        if (input.additionalAmount <= 0) {
          await paymentService.applyZeroAmountSettlement(tx, "RENEWAL", renewal.id);
        }
        return decorateDetail(
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

  /**
   * The hirer (or staff opening the same link at the desk) confirms the vehicle
   * return: ACTIVE -> RETOUT. This, not issuing the link, is the return-intent
   * event. Serialised with renewal on the lifecycle lock; repeating it once the
   * contract has moved on is a no-op that returns the current view.
   */
  async function confirmReturnPublic(token: string) {
    return withTransaction(prisma, async (tx) => {
      const link = await resolveContractLink(tx, token, "RETURN", { allowCompleted: true });
      await acquireAdvisoryLock(tx, CONTRACT_LIFECYCLE_LOCK_NS, link.contractId);
      const include = {
        company: { select: { code: true, displayName: true, legalNameAr: true, legalNameEn: true } },
        vehicle: { include: { model: { select: { name: true } } } },
      };
      const contract = await tx.contract.findUnique({ where: { id: link.contractId }, include });
      if (!contract) throw contractError.notFound();
      if (contract.status === "RETOUT" || contract.status === "REVIEW" || contract.status === "CLOSED") {
        return publicView(contract);
      }
      assertTransition(contract.status, "RETOUT");
      await tx.contract.update({
        where: { id: contract.id },
        data: { status: "RETOUT", revision: { increment: 1 } },
      });
      // A renewal offer can no longer be accepted once the return is confirmed.
      await revokeUnusedRenewalLinks(tx, contract.id);
      await emit(tx, "contract.return_started", contract.id);
      return publicView(await tx.contract.findUniqueOrThrow({ where: { id: contract.id }, include }));
    });
  }

  async function confirmRenewalPublic(token: string) {
    return withTransaction(prisma, async (tx) => {
      const include = {
        company: { select: { code: true, displayName: true, legalNameAr: true, legalNameEn: true } },
        vehicle: { include: { model: { select: { name: true } } } },
        renewals: { orderBy: { createdAt: "desc" as const } },
      };
      const preview = await resolveContractLink(tx, token, "RENEWAL", { allowCompleted: true });
      if (preview.usedAt) {
        const already = await tx.contract.findUnique({
          where: { id: preview.contractId },
          include,
        });
        if (!already) throw contractError.notFound();
        return publicView(already, pickPublicRenewal(already.renewals, true));
      }

      await acquireAdvisoryLock(tx, CONTRACT_LIFECYCLE_LOCK_NS, preview.contractId);
      const contract = await tx.contract.findUnique({
        where: { id: preview.contractId },
        include,
      });
      if (!contract) throw contractError.notFound();
      assertStatus(contract.status, "ACTIVE");
      await assertVehicleFreeForRental(tx, contract.vehicleId, contract.id);

      const lockedLink = await resolveContractLink(tx, token, "RENEWAL", { allowCompleted: true });
      if (lockedLink.usedAt) {
        const already = await tx.contract.findUniqueOrThrow({
          where: { id: lockedLink.contractId },
          include,
        });
        return publicView(already, pickPublicRenewal(already.renewals, true));
      }

      const pending = contract.renewals.find((row) => row.approvedAt == null);
      if (!pending) throw contractError.renewalOfferRequired();

      await tx.contractRenewal.update({
        where: { id: pending.id },
        data: { approvedAt: new Date() },
      });
      if (pending.additionalAmount <= 0) {
        await paymentService.applyZeroAmountSettlement(tx, "RENEWAL", pending.id);
        await markLinkUsed(tx, lockedLink.id);
      }

      const fresh = await tx.contract.findUniqueOrThrow({
        where: { id: contract.id },
        include,
      });
      return publicView(fresh, pickPublicRenewal(fresh.renewals, true));
    });
  }

  function publicView(
    row: {
      contractNumber: string;
      status: z.infer<typeof import("./contracts.schema").ContractStatusSchema>;
      priceType: z.infer<typeof import("./contracts.schema").ContractPriceTypeSchema>;
      rentalDays: number;
      agreedAmount: number;
      currency: string;
      startAt: Date | null;
      endAt: Date | null;
      termsVersion: string;
      company: {
        code: string;
        displayName: string;
        legalNameAr: string;
        legalNameEn: string;
      };
      vehicle: {
        vehicleName: string | null;
        plateNumber: string | null;
        color: string | null;
        modelYear: number | null;
        model: { name: string } | null;
      };
    },
    renewal?: ReturnType<typeof toPublicRenewal> | null,
  ) {
    return {
      // Renting company, read from the Contract. The customer never selects it.
      office: {
        displayName: env.OFFICE_DISPLAY_NAME || OFFICE_DISPLAY_NAME_DEFAULT,
        company: row.company,
      },
      contractNumber: row.contractNumber,
      status: row.status,
      priceType: row.priceType,
      rentalDays: row.rentalDays,
      agreedAmount: row.agreedAmount,
      currency: row.currency,
      startAt: row.startAt,
      endAt: row.endAt,
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
      ...(renewal === undefined
        ? {}
        : {
            renewal,
            payment: { providerAvailable: createPaymentProvider().configured },
          }),
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

      const ocr = await analyzeDrivingLicenseDocument({
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

  /** DEV-only OCR substitution on a real rental link and persisted contract. */
  async function simulateDrivingLicense(token: string) {
    assertSimulationEnabled();
    const preview = await resolveContractLink(prisma, token, "RENTAL");
    const attachmentId = await createSimulationAttachment(prisma, "dev-driving-license.png");
    return withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, CONTRACT_LICENSE_LOCK_NS, preview.contractId);
      const contract = await tx.contract.findUnique({ where: { id: preview.contractId } });
      if (!contract) throw contractError.notFound();
      if (contract.status !== "AWAITING" && contract.status !== "FORM") {
        throw contractError.invalidTransition(contract.status, contract.status);
      }
      await tx.contractDocument.updateMany({
        where: { contractId: contract.id, type: "DRIVING_LICENSE", supersededAt: null },
        data: { supersededAt: new Date() },
      });
      const document = await tx.contractDocument.create({
        data: { contractId: contract.id, type: "DRIVING_LICENSE", attachmentId },
      });
      const ocr = await analyzeDrivingLicenseDocumentWithProvider(
        createSimulationDocumentOcrProvider(),
      );
      const evaluated = evaluateDrivingLicenseOcr(
        ocr,
        new Date(),
        env.BUSINESS_TIMEZONE_OFFSET_MINUTES,
      );
      await tx.drivingLicenseVerification.create({
        data: {
          contractId: contract.id,
          documentId: document.id,
          attachmentId,
          status: evaluated.status,
          licenseNumber: evaluated.licenseNumber,
          expiryDate: evaluated.expiryDate,
          confidence: evaluated.confidence,
          provider: evaluated.provider,
          providerVersion: evaluated.providerVersion,
          verifiedAt: new Date(),
        },
      });
      await emit(tx, "contract.license_simulated", contract.id, { documentId: document.id, dedupe: document.id });
      return loadPublicRental(tx, contract.id);
    });
  }

  async function analyzeDrivingLicenseDocumentWithProvider(provider: ReturnType<typeof createSimulationDocumentOcrProvider>) {
    return analyzeDrivingLicenseDocumentWithBytes(provider);
  }

  async function analyzeDrivingLicenseDocumentWithBytes(provider: ReturnType<typeof createSimulationDocumentOcrProvider>) {
    const outcome = await analyzeDocument("DRIVER_LICENSE", { bytes: SIMULATION_PNG, mimeType: "image/png" }, provider);
    if (!outcome.ok) {
      return { ok: false as const, reason: "UNREADABLE" as const, provider: outcome.provider, providerVersion: outcome.providerVersion ?? undefined };
    }
    return {
      ok: true as const,
      licenseNumber: outcome.result.driverLicenseNumber,
      expiryDate: outcome.result.driverLicenseExpiryDate,
      holderName: outcome.result.fullName,
      confidence: outcome.result.confidence,
      fieldConfidences: {
        licenseNumber: outcome.result.fieldConfidence.driverLicenseNumber,
        expiryDate: outcome.result.fieldConfidence.driverLicenseExpiryDate,
      },
      provider: outcome.provider,
      providerVersion: outcome.providerVersion ?? undefined,
    };
  }

  /**
   * Passport capture. Context comes only from the token. Requires the current
   * driving license to be VALID. OCR runs outside any transaction; the result
   * is written only if this attempt is still the active one, so a slow earlier
   * attempt can never overwrite a newer retake. No Customer is created or
   * updated and no legal snapshot is taken.
   */
  async function uploadPassport(token: string, file: MultipartFile) {
    const assertPassportAllowed = async (db: Parameters<typeof latestLicense>[0], contractId: string) => {
      const contract = await db.contract.findUnique({ where: { id: contractId } });
      if (!contract) throw contractError.notFound();
      if (contract.status !== "AWAITING" && contract.status !== "FORM") {
        throw contractError.invalidTransition(contract.status, contract.status);
      }
      const license = await latestLicense(db, contract.id);
      if (license?.status !== "VALID") throw contractError.passportLicenseRequired();
      return contract;
    };

    const preview = await resolveContractLink(prisma, token, "RENTAL");
    await assertPassportAllowed(prisma, preview.contractId);

    const attachment = await files.save(file, null, { allowedMime: PASSPORT_UPLOAD_MIME });
    const stored = await prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } });
    const bytes = await readFile(resolveStoragePath(env.FILE_STORAGE_DIR, stored.storageKey));

    const attempt = await withTransaction(prisma, async (tx) => {
      const link = await resolveContractLink(tx, token, "RENTAL");
      await acquireAdvisoryLock(tx, CONTRACT_PASSPORT_LOCK_NS, link.contractId);
      const contract = await assertPassportAllowed(tx, link.contractId);

      await tx.contractDocument.updateMany({
        where: { contractId: contract.id, type: "PASSPORT", supersededAt: null },
        data: { supersededAt: new Date() },
      });
      const document = await tx.contractDocument.create({
        data: { contractId: contract.id, type: "PASSPORT", attachmentId: attachment.id },
      });
      const extraction = await tx.passportExtraction.create({
        data: {
          contractId: contract.id,
          documentId: document.id,
          attachmentId: attachment.id,
          status: "PROCESSING",
        },
      });
      await emit(tx, "contract.passport_uploaded", contract.id, {
        documentId: document.id,
        dedupe: document.id,
      });
      return { contractId: contract.id, extractionId: extraction.id };
    });

    const evaluated = evaluatePassportOcr(
      await analyzeDocument("PASSPORT", { bytes, mimeType: attachment.mimeType }),
    );

    return withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, CONTRACT_PASSPORT_LOCK_NS, attempt.contractId);
      const current = await tx.passportExtraction.findUnique({
        where: { id: attempt.extractionId },
        include: { document: { select: { supersededAt: true } } },
      });
      const stillActive =
        current && current.status === "PROCESSING" && current.document.supersededAt === null;
      if (stillActive) {
        const { status, ...fields } = evaluated;
        await tx.passportExtraction.update({
          where: { id: current.id },
          data: { ...fields, status, completedAt: new Date() },
        });
        await emit(tx, "contract.passport_processed", attempt.contractId, {
          extractionId: current.id,
          status,
          dedupe: current.id,
        });
      }
      return loadPublicRental(tx, attempt.contractId);
    });
  }

  /** DEV-only passport OCR substitution on the same persisted contract. */
  async function simulatePassport(token: string) {
    assertSimulationEnabled();
    const preview = await resolveContractLink(prisma, token, "RENTAL");
    const attachmentId = await createSimulationAttachment(prisma, "dev-passport.png");
    return withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, CONTRACT_PASSPORT_LOCK_NS, preview.contractId);
      const contract = await tx.contract.findUnique({ where: { id: preview.contractId } });
      if (!contract) throw contractError.notFound();
      if (contract.status !== "AWAITING" && contract.status !== "FORM") {
        throw contractError.invalidTransition(contract.status, contract.status);
      }
      const license = await latestLicense(tx, contract.id);
      if (license?.status !== "VALID") throw contractError.passportLicenseRequired();
      await tx.contractDocument.updateMany({
        where: { contractId: contract.id, type: "PASSPORT", supersededAt: null },
        data: { supersededAt: new Date() },
      });
      const document = await tx.contractDocument.create({
        data: { contractId: contract.id, type: "PASSPORT", attachmentId },
      });
      const extraction = await tx.passportExtraction.create({
        data: { contractId: contract.id, documentId: document.id, attachmentId, status: "PROCESSING" },
      });
      const evaluated = evaluatePassportOcr(
        await analyzeDocument(
          "PASSPORT",
          { bytes: SIMULATION_PNG, mimeType: "image/png" },
          createSimulationDocumentOcrProvider(),
        ),
      );
      const { status, ...fields } = evaluated;
      await tx.passportExtraction.update({
        where: { id: extraction.id },
        data: { ...fields, status, completedAt: new Date() },
      });
      await emit(tx, "contract.passport_simulated", contract.id, { extractionId: extraction.id, dedupe: extraction.id });
      return loadPublicRental(tx, contract.id);
    });
  }

  /** DEV-only provider signal; settlement uses the same domain settlement path as Stripe. */
  async function simulatePayment(token: string, idempotencyKey: string) {
    assertSimulationEnabled();
    if (!idempotencyKey.trim()) throw contractError.paymentIdempotencyRequired();
    const run = async () => {
      const link = await resolveContractLink(prisma, token, "RENTAL", { allowCompleted: true });
      await paymentService.simulateSuccessfulPayment(link.contractId);
      return withTransaction(prisma, (tx) => loadPublicRental(tx, link.contractId));
    };
    const outcome = await runIdempotent(prisma, {
      scope: `contract:dev-payment:${hashToken(token)}`,
      key: idempotencyKey,
      fingerprint: fingerprintIdempotentPayload({ method: "DEV_SIMULATION" }),
    }, run);
    if (outcome.deduped) {
      const link = await resolveContractLink(prisma, token, "RENTAL", { allowCompleted: true });
      return withTransaction(prisma, (tx) => loadPublicRental(tx, link.contractId));
    }
    return outcome.result!;
  }

  async function loadOfficialContract(
    tx: Parameters<Parameters<typeof withTransaction>[1]>[0],
    contractId: string,
  ) {
    const row = await tx.contract.findUnique({
      where: { id: contractId },
      include: OFFICIAL_CONTRACT_INCLUDE,
    });
    if (!row) throw contractError.notFound();
    return buildOfficialContractView(row, {
      officeDisplayName: env.OFFICE_DISPLAY_NAME || OFFICE_DISPLAY_NAME_DEFAULT,
      requiresCardSetupBeforeSigning: requiresCardSetupBeforeSigning(),
    }).view;
  }

  /** Read-only composition from authoritative sources. No OCR call, no writes. */
  async function getPublicOfficialContract(token: string) {
    return withTransaction(prisma, async (tx) => {
      const link = await resolveContractLink(tx, token, "RENTAL", { allowCompleted: true });
      return loadOfficialContract(tx, link.contractId);
    });
  }

  async function lockReviewableContract(
    tx: Parameters<Parameters<typeof withTransaction>[1]>[0],
    token: string,
  ) {
    const link = await resolveContractLink(tx, token, "RENTAL");
    await acquireAdvisoryLock(tx, CONTRACT_OFFICIAL_REVIEW_LOCK_NS, link.contractId);
    const contract = await tx.contract.findUnique({ where: { id: link.contractId } });
    if (!contract) throw contractError.notFound();
    if (!OFFICIAL_CONTRACT_REVIEWABLE_STATUSES.includes(contract.status)) {
      throw contractError.officialContractReviewLocked();
    }
    if (contract.status === "AWAITING" && !(await identityDraftFor(tx, contract.id)).identityReady) {
      throw contractError.identityNotReady();
    }
    return contract;
  }

  /** Records completion of the real customer review before any legal signing. */
  async function submitPublicOfficialContractReview(token: string) {
    return withTransaction(prisma, async (tx) => {
      const contract = await lockReviewableContract(tx, token);
      if (contract.status === "AWAITING") {
        assertTransition("AWAITING", "FORM");
        await tx.contract.update({
          where: { id: contract.id },
          data: { status: "FORM", revision: { increment: 1 } },
        });
        await emit(tx, "contract.form_completed", contract.id);
      }
      return { contractId: contract.id, view: await loadOfficialContract(tx, contract.id) };
    });
  }

  /**
   * Saves the customer's review-link input: only the fields in
   * OFFICIAL_CONTRACT_EDITABLE_FIELDS (card last 4). Anything else is rejected.
   * Does not touch PassportExtraction, license verification, Customer, Vehicle,
   * pricing, custody, or the contract status.
   */
  async function updatePublicOfficialContractReview(
    token: string,
    patch: OfficialContractReviewPatch,
  ) {
    return withTransaction(prisma, async (tx) => {
      const contract = await lockReviewableContract(tx, token);

      // Lifecycle lock (409) takes precedence over field policy (403): once the
      // agreement is no longer reviewable, every key is locked for that reason.
      const editable: readonly string[] = OFFICIAL_CONTRACT_EDITABLE_FIELDS;
      const locked = Object.keys(patch).filter((key) => !editable.includes(key));
      if (locked.length > 0) throw contractError.officialContractFieldLocked(locked);

      const data: Prisma.OfficialContractReviewDraftUncheckedUpdateInput = {};
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        if (key === "damageOut") {
          data.damageOut =
            value === null ? Prisma.DbNull : (readDamageMarks(value) as unknown as Prisma.InputJsonValue);
        } else if (key === "telephone" && typeof value === "string") {
          data.telephone = normalizePhone(value);
        } else {
          (data as Record<string, unknown>)[key] = value;
        }
      }
      const changedFields = Object.keys(data);
      const reviewedAt = new Date();
      await tx.officialContractReviewDraft.upsert({
        where: { contractId: contract.id },
        create: {
          ...(data as Prisma.OfficialContractReviewDraftUncheckedCreateInput),
          contractId: contract.id,
          reviewedAt,
        },
        update: { ...data, reviewedAt, revision: { increment: 1 } },
      });
      await emit(tx, "contract.official_review_updated", contract.id, {
        fields: changedFields,
        dedupe: `${reviewedAt.getTime()}`,
      });
      return {
        contractId: contract.id,
        changedFields,
        view: await loadOfficialContract(tx, contract.id),
      };
    });
  }

  /** Captures (or replaces) one signature image. PNG only, via the Attachment store. */
  async function savePublicOfficialSignature(
    token: string,
    slot: OfficialContractSignatureSlot,
    file: MultipartFile,
  ) {
    if (!PUBLIC_SIGNABLE_SLOTS.includes(slot)) throw contractError.officialSignatureSlotUnavailable();
    // Validate link + lifecycle before storing any bytes.
    await withTransaction(prisma, (tx) => lockReviewableContract(tx, token));
    const attachment = await files.save(file, null, { allowedMime: SIGNATURE_UPLOAD_MIME });
    return withTransaction(prisma, async (tx) => {
      const contract = await lockReviewableContract(tx, token);
      const capturedAt = new Date();
      await tx.officialContractSignature.upsert({
        where: { contractId_slot: { contractId: contract.id, slot } },
        create: { contractId: contract.id, slot, attachmentId: attachment.id, capturedAt },
        update: { attachmentId: attachment.id, capturedAt },
      });
      await emit(tx, "contract.official_signature_captured", contract.id, {
        slot,
        dedupe: `${slot}:${capturedAt.getTime()}`,
      });
      return { contractId: contract.id, view: await loadOfficialContract(tx, contract.id) };
    });
  }

  async function clearPublicOfficialSignature(token: string, slot: OfficialContractSignatureSlot) {
    if (!PUBLIC_SIGNABLE_SLOTS.includes(slot)) throw contractError.officialSignatureSlotUnavailable();
    return withTransaction(prisma, async (tx) => {
      const contract = await lockReviewableContract(tx, token);
      await tx.officialContractSignature.deleteMany({ where: { contractId: contract.id, slot } });
      return { contractId: contract.id, view: await loadOfficialContract(tx, contract.id) };
    });
  }

  /** Token-scoped signature image stream. No storage key or attachment id is exposed. */
  async function openPublicOfficialSignature(token: string, slot: OfficialContractSignatureSlot) {
    const link = await resolveContractLink(prisma, token, "RENTAL", { allowCompleted: true });
    return openStaffOfficialSignature(link.contractId, slot);
  }

  async function openStaffOfficialSignature(contractId: string, slot: OfficialContractSignatureSlot) {
    const signature = await prisma.officialContractSignature.findUnique({
      where: { contractId_slot: { contractId, slot } },
      include: { attachment: true },
    });
    if (!signature) throw AppError.notFound("Signature not found");
    return {
      mimeType: signature.attachment.mimeType,
      stream: createReadStream(resolveStoragePath(env.FILE_STORAGE_DIR, signature.attachment.storageKey)),
    };
  }

  /**
   * Signs the official contract: verifies identity, required fields and
   * required signatures, then AWAITING/FORM → SIGNED with a ContractAcceptance
   * and a frozen snapshot of the exact official contract view. The Customer
   * master record is not created or changed.
   */
  async function signPublicOfficialContract(
    token: string,
    input: { termsVersion?: string },
    meta: { ip?: string; userAgent?: string },
  ) {
    return withTransaction(prisma, async (tx) => {
      const contract = await lockReviewableContract(tx, token);
      if (contract.status !== "FORM") throw contractError.invalidTransition(contract.status, "SIGNED");
      const verification = await latestLicense(tx, contract.id);
      const row = await tx.contract.findUniqueOrThrow({
        where: { id: contract.id },
        include: { ...OFFICIAL_CONTRACT_INCLUDE, officialSignatures: { select: { slot: true, capturedAt: true, attachmentId: true } } },
      });
      const { view } = buildOfficialContractView(row, {
        officeDisplayName: env.OFFICE_DISPLAY_NAME || OFFICE_DISPLAY_NAME_DEFAULT,
        requiresCardSetupBeforeSigning: requiresCardSetupBeforeSigning(),
      });
      if (!view.permissions.canSign) {
        throw contractError.officialContractIncomplete(view.permissions.missingRequirements);
      }
      if (!(await tars.isOtpVerificationSatisfied(contract.id))) {
        throw tarsError.otpVerificationRequired();
      }

      assertTransition(contract.status, "SIGNED");

      const legalView = { ...view, contract: { ...view.contract, status: "SIGNED" as const } };
      const snapshot = {
        ...buildContractSnapshot({
          contractNumber: row.contractNumber,
          customer: {
            name: view.hirer.name ?? "",
            mobile: view.hirer.telephone,
            email: null,
            nationality: view.hirer.nationality,
            identityNumber: null,
            passportNumber: view.hirer.passportNumber,
            drivingLicenseNumber: view.hirer.driverLicenseNumber,
            drivingLicenseExpiry: verification?.expiryDate ?? null,
            address: view.hirer.address,
          },
          vehicle: {
            vehicleName: row.vehicle.vehicleName,
            plateNumber: row.vehicle.plateNumber,
            modelYear: row.vehicle.modelYear,
            color: row.vehicle.color,
            vin: row.vehicle.vin,
            modelName: row.vehicle.model?.name ?? null,
          },
          commercial: {
            agreedAmount: row.agreedAmount,
            priceType: row.priceType,
            rentalDays: row.rentalDays,
            startAt: row.startAt,
            endAt: row.endAt,
            currency: row.currency,
          },
          termsVersion: input.termsVersion ?? row.termsVersion,
        }),
        officialContract: legalView,
      };

      const hirerSignature = row.officialSignatures.find((s) => s.slot === "HIRER");
      await tx.contractAcceptance.create({
        data: {
          contractId: contract.id,
          acceptedAt: new Date(),
          ip: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
          termsVersion: input.termsVersion ?? row.termsVersion,
          signatureAttachmentId: hirerSignature?.attachmentId ?? null,
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
      return { contractId: contract.id, view: await loadOfficialContract(tx, contract.id) };
    });
  }

  /** Staff-only official-contract terms (plate code, notes, km terms, Vehicle IN damage). */
  async function updateOfficialContractTerms(contractId: string, terms: OfficialContractStaffTerms) {
    return withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, CONTRACT_OFFICIAL_REVIEW_LOCK_NS, contractId);
      const contract = await tx.contract.findUnique({ where: { id: contractId } });
      if (!contract) throw contractError.notFound();
      const damageInOnly = Object.keys(terms).every((key) => key === "damageIn");
      if (!damageInOnly && !OFFICIAL_CONTRACT_REVIEWABLE_STATUSES.includes(contract.status)) {
        throw contractError.officialContractReviewLocked();
      }
      const data: Prisma.OfficialContractReviewDraftUncheckedUpdateInput = {};
      for (const [key, value] of Object.entries(terms)) {
        if (value === undefined) continue;
        if (key === "damageIn") {
          data.damageIn =
            value === null ? Prisma.DbNull : (readDamageMarks(value) as unknown as Prisma.InputJsonValue);
        } else {
          (data as Record<string, unknown>)[key] = value;
        }
      }
      await tx.officialContractReviewDraft.upsert({
        where: { contractId },
        create: { ...(data as Prisma.OfficialContractReviewDraftUncheckedCreateInput), contractId },
        update: { ...data, revision: { increment: 1 } },
      });
      return { fields: Object.keys(data), view: await loadOfficialContract(tx, contractId) };
    });
  }

  async function getPublicIdentityDraft(token: string) {
    return withTransaction(prisma, async (tx) => {
      const link = await resolveContractLink(tx, token, "RENTAL", { allowCompleted: true });
      return toPublicIdentityDraft(await identityDraftFor(tx, link.contractId));
    });
  }

  async function getPublicRental(token: string) {
    try {
      await withTransaction(prisma, async (tx) => {
        const link = await resolveContractLink(tx, token, "RENTAL", { allowCompleted: true });
        const activePayment = await tx.contractPayment.findFirst({
          where: { contractId: link.contractId, purpose: "RENTAL", status: { in: ["PENDING", "PROCESSING"] } },
          orderBy: { createdAt: "desc" },
        });
        if (activePayment) await paymentService.applyProviderPaymentStatus(tx, activePayment.id);
      });
    } catch {
      // A failed Stripe lookup must roll back its whole transaction. The page
      // remains readable and keeps the attempt in flight for later recovery.
    }
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
        cardLast4: ctx.payment.cardLast4 ?? null,
        cardBrand: ctx.payment.cardBrand ?? null,
      };
    });
  }

  async function startCardPayment(
    token: string,
    idempotencyKey?: string,
    locale: PublicFrontendLocale = "en",
    savePaymentMethodForFutureUse = false,
  ) {
    if (!idempotencyKey?.trim()) throw contractError.paymentIdempotencyRequired();
    const run = async () => {
      const link = await resolveContractLink(prisma, token, "RENTAL");
      const contract = await prisma.contract.findUnique({ where: { id: link.contractId } });
      if (!contract) throw contractError.notFound();
      if (contract.status !== "SIGNED") throw contractError.paymentNotAllowed();

      const verification = await latestLicense(prisma, contract.id);
      assertLicenseProgress(verification?.status, verification?.expiryDate);

      const result = await paymentService.startPayment({
        purpose: "RENTAL",
        targetId: contract.id,
        locale,
        savePaymentMethodForFutureUse,
        cancelUrl: buildPublicFrontendUrl(locale, `/rental/${token}`, { payment: "cancelled" }),
        validate: async (_tx, obligation) => {
          if (obligation.amount <= 0) throw contractError.paymentNotAllowed();
        },
      });
      return {
        payment: {
          status: result.payment.status,
          amount: result.payment.amount,
          currency: result.payment.currency,
          method: "CARD" as const,
        },
        checkoutUrl: result.payment.checkoutUrl,
        statusToken: result.statusToken,
        providerAvailable: result.providerAvailable,
      };
    };

    const outcome = await runIdempotent(
      prisma,
      {
        scope: `contract:card-payment:${hashToken(token)}`,
        key: idempotencyKey,
        fingerprint: fingerprintIdempotentPayload({ method: "CARD", savePaymentMethodForFutureUse }),
      },
      run,
    );
    if (outcome.deduped) {
      const link = await resolveContractLink(prisma, token, "RENTAL", { allowCompleted: true });
      const payment = await prisma.contractPayment.findFirst({
        where: { contractId: link.contractId, purpose: "RENTAL" },
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
        checkoutUrl: payment.checkoutUrl,
        statusToken: null,
        providerAvailable: createPaymentProvider().configured,
      };
    }
    return outcome.result!;
  }

  async function startCardLink(token: string, locale: PublicFrontendLocale = "en") {
    const link = await resolveContractLink(prisma, token, "RENTAL");
    const contract = await prisma.contract.findUnique({ where: { id: link.contractId } });
    if (!contract) throw contractError.notFound();
    if (!["AWAITING", "FORM", "SIGNED"].includes(contract.status)) throw contractError.paymentNotAllowed();
    const saved = await prisma.contractCardPaymentMethod.findUnique({
      where: { contractId: contract.id },
    });
    const provider = createPaymentProvider();
    const result = await provider.createCardSetupSession({
      contractId: contract.id,
      stripeCustomerId: saved?.stripeCustomerId ?? null,
      successUrl: `${buildPublicFrontendUrl(locale, `/rental/${token}`)}?card=linked&setup_session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: buildPublicFrontendUrl(locale, `/rental/${token}`, { card: "cancelled" }),
    });
    if (!result.ok) throw contractError.paymentProviderNotConfigured();
    return { checkoutUrl: result.checkoutUrl, providerAvailable: true };
  }

  async function completeCardLink(token: string, setupSessionId: string) {
    const link = await resolveContractLink(prisma, token, "RENTAL");
    const contract = await prisma.contract.findUnique({ where: { id: link.contractId } });
    if (!contract) throw contractError.notFound();
    if (!["AWAITING", "FORM", "SIGNED"].includes(contract.status)) throw contractError.paymentNotAllowed();
    const result = await paymentService.processCardSetupReturn({
      contractId: contract.id,
      providerReference: setupSessionId,
    });
    return {
      status: result.status,
      cardLast4: result.cardLast4,
      cardBrand: result.cardBrand,
      providerAvailable: createPaymentProvider().configured,
    };
  }

  async function startReconciliationPayment(contractId: string, actorUserId: number) {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: { reconciliation: true },
    });
    if (!contract) throw contractError.notFound();
    if (contract.status !== "REVIEW") throw contractError.paymentNotAllowed();
    if (!contract.reconciliation?.approvedAt) throw contractError.reconciliationRequired();
    if (contract.reconciliation.finalAmount <= 0) {
      await withTransaction(prisma, async (tx) => {
        await paymentService.applyZeroAmountSettlement(
          tx,
          "RECONCILIATION",
          contract.reconciliation!.id,
        );
      });
      return {
        payment: {
          status: "CONFIRMED" as const,
          amount: 0,
          currency: contract.currency,
          purpose: "RECONCILIATION" as const,
          checkoutUrl: null,
          checkoutExpiresAt: null,
        },
        checkoutUrl: null,
        statusToken: null,
        providerAvailable: createPaymentProvider().configured,
        noPaymentRequired: true,
      };
    }
    const result = await paymentService.startPayment({
      purpose: "RECONCILIATION",
      targetId: contract.reconciliation.id,
      createdByUserId: actorUserId,
      validate: async (tx) => {
        const row = await tx.contract.findUnique({
          where: { id: contractId },
          include: { reconciliation: true },
        });
        if (!row?.reconciliation?.approvedAt) throw contractError.reconciliationRequired();
      },
    });
    return {
      payment: result.payment,
      checkoutUrl: result.payment.checkoutUrl,
      statusToken: result.statusToken,
      providerAvailable: result.providerAvailable,
    };
  }

  async function startPostClosePayment(
    contractId: string,
    receivableId: string,
    actorUserId: number,
  ) {
    const receivable = await prisma.contractPostCloseReceivable.findFirst({
      where: { id: receivableId, contractId },
    });
    if (!receivable) throw contractError.notFound();
    if (receivable.status !== "OPEN") throw contractError.paymentAlreadySettled();

    const result = await paymentService.startPayment({
      purpose: "POST_CLOSE_RECEIVABLE",
      targetId: receivable.id,
      createdByUserId: actorUserId,
    });
    return {
      payment: result.payment,
      checkoutUrl: result.payment.checkoutUrl,
      statusToken: result.statusToken,
      providerAvailable: result.providerAvailable,
    };
  }

  async function startRenewalPaymentPublic(
    token: string,
    locale: PublicFrontendLocale = "en",
  ) {
    const link = await resolveContractLink(prisma, token, "RENEWAL", { allowCompleted: true });
    const renewal = await prisma.contractRenewal.findFirst({
      where: {
        contractId: link.contractId,
        approvedAt: { not: null },
        appliedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });
    if (!renewal) throw contractError.renewalOfferRequired();
    if (renewal.additionalAmount <= 0) throw contractError.paymentNotAllowed();

    const result = await paymentService.startPayment({
      purpose: "RENEWAL",
      targetId: renewal.id,
      locale,
      validate: async (tx) => {
        const row = await tx.contractRenewal.findUnique({ where: { id: renewal.id } });
        if (!row?.approvedAt) throw contractError.renewalOfferRequired();
        if (row.appliedAt) throw contractError.paymentAlreadySettled();
        // No new renewal payment once the hirer has confirmed the return.
        const contract = await tx.contract.findUnique({ where: { id: renewal.contractId }, select: { status: true } });
        if (contract?.status !== "ACTIVE") throw contractError.invalidTransition(contract?.status ?? "ACTIVE", "ACTIVE");
      },
    });

    if (result.payment.status === "CONFIRMED") {
      await withTransaction(prisma, async (tx) => {
        await markLinkUsed(tx, link.id);
      });
    }

    return {
      payment: {
        status: result.payment.status,
        amount: result.payment.amount,
        currency: result.payment.currency,
        method: "CARD" as const,
      },
      checkoutUrl: result.payment.checkoutUrl,
      statusToken: result.statusToken,
      providerAvailable: result.providerAvailable,
    };
  }

  async function getPaymentStatusByToken(statusToken: string) {
    return paymentService.getPaymentStatusByToken(statusToken);
  }

  async function getPublic(type: "RENTAL" | "RETURN" | "RENEWAL", token: string) {
    return withTransaction(prisma, async (tx) => {
      const link = await resolveContractLink(tx, token, type, {
        allowCompleted: type === "RETURN" || type === "RENEWAL",
      });
      const contract = await tx.contract.findUnique({
        where: { id: link.contractId },
        include: {
          company: { select: { code: true, displayName: true, legalNameAr: true, legalNameEn: true } },
          vehicle: { include: { model: { select: { name: true } } } },
          renewals: { orderBy: { createdAt: "desc" as const } },
        },
      });
      if (!contract) throw contractError.notFound();
      if (type !== "RENEWAL") return publicView(contract);
      return publicView(contract, pickPublicRenewal(contract.renewals, Boolean(link.usedAt)));
    });
  }

  async function openInspectionStream(
    contractId: string,
    side: "out" | "in",
    photoId: string,
  ) {
    if (side === "out") {
      const completedPhoto = await prisma.contractCarOutPhoto.findFirst({
        where: { id: photoId, carOut: { contractId } },
        include: { attachment: true },
      });
      const photo = completedPhoto ?? await prisma.contractCarOutDraftPhoto.findFirst({
        where: { id: photoId, carOutDraft: { contractId } },
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
    const completedInPhoto = await prisma.contractCarInPhoto.findFirst({
      where: { id: photoId, carIn: { contractId } },
      include: { attachment: true },
    });
    const photo = completedInPhoto ?? await prisma.contractCarInDraftPhoto.findFirst({
      where: { id: photoId, carInDraft: { contractId } },
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
    saveCarOutDraft,
    uploadCarOutPhoto,
    uploadCarOutSignature,
    deleteCarOutPhoto,
    openCarOutSignatureStream,
    submitPublicForm,
    submitPublicOfficialContractReview,
    acceptPublic,
    carIn,
    carInStaff,
    saveCarInDraft,
    uploadCarInPhoto,
    uploadCarInSignature,
    deleteCarInPhoto,
    openCarInSignatureStream,
    completeCarInStaff,
    reconcile,
    listReconciliationRoadLiabilities,
    confirmRoadLiabilityCharge,
    close,
    renew,
    confirmReturnPublic,
    confirmRenewalPublic,
    getPublic,
    getPublicRental,
    uploadDrivingLicense,
    simulateDrivingLicense,
    uploadPassport,
    simulatePassport,
    getPublicIdentityDraft,
    getPublicOfficialContract,
    updatePublicOfficialContractReview,
    savePublicOfficialSignature,
    clearPublicOfficialSignature,
    openPublicOfficialSignature,
    openStaffOfficialSignature,
    signPublicOfficialContract,
    requestPublicTarsOtp,
    verifyPublicTarsOtp,
    updateOfficialContractTerms,
    getPaymentContext,
    startCardPayment,
    startCardLink,
    completeCardLink,
    simulatePayment,
    startReconciliationPayment,
    startPostClosePayment,
    startRenewalPaymentPublic,
    getPaymentStatusByToken,
    openInspectionStream,
  };
}
