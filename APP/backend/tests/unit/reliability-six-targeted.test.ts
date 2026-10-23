import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STRIPE_WEBHOOK_PROCESSING_LEASE_MS } from "src/modules/contracts/payment/stripe-webhook-inbox.service";
import {
  roadChargeReferenceLockEntity,
  reserveStaffManualReference,
} from "src/modules/road-liabilities/road-charge-reference.service";
import { RoadChargeReferenceReason } from "src/modules/road-liabilities/road-charge-reference.errors";
import { AppError } from "src/lib/errors/app-error";
import { FN } from "src/lib/rbac/functional-permissions/keys";
import { resolveRouteFunctionalRequirement } from "src/lib/rbac/functional-permissions/route-requirements";
import {
  assertVehicleMediaMutationAuthorized,
} from "src/lib/rbac/functional-permissions/vehicle-media-enforcement";
import type { AuthUser } from "src/lib/context/auth-context";
import { normalizeFunctionalGrants } from "src/lib/rbac/functional-permissions/policy-engine";
function employee(grants: string[]): AuthUser {
  const normalized = normalizeFunctionalGrants(grants);
  return {
    id: 2,
    email: "emp@test.local",
    status: "ACTIVE",
    permissions: normalized.ok ? normalized.normalized : grants,
    roleKeys: ["custom"],
    isSystemAdmin: false,
  };
}

describe("1 — Stripe crash recovery lease", () => {
  it("uses a bounded processing lease for inbox reclaim", () => {
    assert.equal(STRIPE_WEBHOOK_PROCESSING_LEASE_MS, 5 * 60 * 1000);
    const inbox = readFileSync(
      join(process.cwd(), "src/modules/contracts/payment/stripe-webhook-inbox.service.ts"),
      "utf8",
    );
    assert.match(inbox, /processingStatus.*PROCESSING/);
    assert.match(inbox, /availableAt: leaseUntil/);
  });
});

describe("2 — Duplicate violation reference reservation", () => {
  it("normalizes lock entities for Salik/traffic references", () => {
    assert.equal(
      roadChargeReferenceLockEntity("SALIK", "  ABC-123 "),
      roadChargeReferenceLockEntity("SALIK", "ABC-123"),
    );
  });

  it("rejects a second reservation for the same reference with a different idempotency key", async () => {
    const rows: Array<{
      id: string;
      chargeCategory: string;
      referenceNormalized: string;
      status: string;
      staffManualIdempotencyKey: string | null;
      roadLiabilityId: string | null;
    }> = [];
    let idSeq = 0;
    const db = {
      roadChargeReferenceRegistry: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          const ref = (where.referenceNormalized as string) ?? "";
          const statuses = (where.status as { in: string[] }).in;
          return (
            rows.find(
              (row) =>
                row.referenceNormalized === ref && statuses.includes(row.status),
            ) ?? null
          );
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const duplicate = rows.some(
            (row) =>
              row.chargeCategory === data.chargeCategory &&
              row.referenceNormalized === data.referenceNormalized &&
              (row.status === "RESERVED" || row.status === "CONFIRMED"),
          );
          if (duplicate) {
            const err = new Error("unique") as Error & { code?: string };
            err.code = "P2002";
            throw err;
          }
          const row = {
            id: `reg-${++idSeq}`,
            chargeCategory: data.chargeCategory as string,
            referenceNormalized: data.referenceNormalized as string,
            status: data.status as string,
            staffManualIdempotencyKey: (data.staffManualIdempotencyKey as string) ?? null,
            roadLiabilityId: (data.roadLiabilityId as string) ?? null,
          };
          rows.push(row);
          return row;
        },
      },
    };

    const first = await reserveStaffManualReference(db as never, {
      chargeCategory: "SALIK",
      referenceNumber: "SAL-9001",
      idempotencyKey: "key-a",
      actorUserId: 1,
      roadLiabilityId: "liab-1",
    });
    assert.equal(first.replay, false);

    await assert.rejects(
      () =>
        reserveStaffManualReference(db as never, {
          chargeCategory: "SALIK",
          referenceNumber: "SAL-9001",
          idempotencyKey: "key-b",
          actorUserId: 1,
          roadLiabilityId: "liab-2",
        }),
      (err: unknown) =>
        err instanceof AppError &&
        err.context?.reason === RoadChargeReferenceReason.IN_PROGRESS,
    );
  });
});

describe("3 — Vehicle RBAC V2 media mutations", () => {
  const previous = process.env.FUNCTIONAL_RBAC_V2_ENABLED;

  it("maps gallery mutations to vehicles.add_delete", () => {
    for (const op of [
      "uploadVehiclePhoto",
      "deleteVehiclePhoto",
      "uploadVehicleVideo",
      "deleteVehicleVideo",
    ]) {
      const req = resolveRouteFunctionalRequirement(op);
      assert.deepEqual(req?.keys, [FN.vehicles.addDelete]);
    }
  });

  it("blocks view-only users from media mutation guard", () => {
    process.env.FUNCTIONAL_RBAC_V2_ENABLED = "true";
    assert.throws(() => assertVehicleMediaMutationAuthorized(employee([FN.vehicles.viewPage])));
    assertVehicleMediaMutationAuthorized(employee([FN.vehicles.viewPage, FN.vehicles.addDelete]));
    process.env.FUNCTIONAL_RBAC_V2_ENABLED = previous ?? "false";
  });
});

describe("4 — Docker file persistence", () => {
  it("mounts WhatsApp media under the uploads volume", () => {
    const compose = readFileSync(
      join(process.cwd(), "../../deploy/docker-compose.staging.yml"),
      "utf8",
    );
    assert.match(compose, /uploads:\/app\/uploads/);
    assert.match(compose, /WHATSAPP_MEDIA_ROOT: \/app\/uploads\/whatsapp-media/);
  });
});

