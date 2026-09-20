import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "src/lib/errors/app-error";
import { INSPECTION_ANGLES } from "src/modules/contracts/contracts.constants";
import { TarsUnconfiguredProvider } from "src/modules/integrations/tars/providers/tars-unconfigured.provider";
import { createTarsProvider } from "src/modules/integrations/tars/tars.provider";
import { toTarsContractIntegrationState } from "src/modules/integrations/tars/tars.projection";
import {
  buildTarsOperationInput,
  mapCompleteContractInput,
  mapContractAcceptanceInput,
  mapHandoverInput,
  mapRegisterContractInput,
  mapReturnInput,
  type TarsContractRow,
} from "src/modules/integrations/tars/tars.mapper";

const ACCEPTED_AT = new Date("2026-03-02T09:00:00.000Z");
const CAR_OUT_AT = new Date("2026-03-03T07:30:00.000Z");
const CAR_IN_AT = new Date("2026-03-06T16:45:00.000Z");
const APPROVED_AT = new Date("2026-03-06T18:00:00.000Z");
const CLOSED_AT = new Date("2026-03-06T18:30:00.000Z");

function photos(prefix: string) {
  return INSPECTION_ANGLES.map((angle, index) => ({
    id: `${prefix}-photo-${index}`,
    attachmentId: `${prefix}-attachment-${index}`,
    angle,
    attachment: { mimeType: "image/png" },
  }));
}

/** Minimal but realistic Diamond aggregate; the mapper reads nothing else. */
function contractRow(overrides: Partial<TarsContractRow> = {}): TarsContractRow {
  const row = {
    id: "11111111-1111-4111-8111-111111111111",
    contractNumber: "DE-2026-000123",
    status: "CLOSED",
    termsVersion: "diamond-rental-terms-v1",
    priceType: "DAILY",
    rentalDays: 3,
    agreedAmount: 1500,
    currency: "AED",
    depositAmount: 500,
    startAt: new Date("2026-03-03T00:00:00.000Z"),
    endAt: new Date("2026-03-06T00:00:00.000Z"),
    closedAt: CLOSED_AT,
    vehicle: {
      id: 42,
      vehicleName: "Nissan Patrol",
      model: { name: "Patrol" },
      modelYear: 2025,
      plateNumber: "DXB A 12345",
      vin: "VIN-TEST-0001",
      color: "White",
    },
    customer: {
      id: 7,
      name: "Omar Test",
      type: "INDIVIDUAL",
      mobile: "+971500000001",
      email: "omar@example.test",
      nationality: "AE",
      identityNumber: "784-1990-123",
      passportNumber: "P123",
      address: "Dubai",
      drivingLicenseNumber: "CUSTOMER-TYPED",
      drivingLicenseExpiry: new Date("2031-05-05T12:00:00.000Z"),
    },
    acceptance: {
      acceptedAt: ACCEPTED_AT,
      termsVersion: "diamond-rental-terms-v1",
      signatureAttachmentId: "signature-attachment-1",
    },
    carOut: {
      occurredAt: CAR_OUT_AT,
      mileageOut: 12000,
      fuelOut: "F",
      notes: "clean",
      photos: photos("out"),
    },
    carIn: {
      occurredAt: CAR_IN_AT,
      mileageIn: 12480,
      fuelIn: "1/2",
      notes: null,
      photos: photos("in"),
    },
    reconciliation: {
      chargesTotal: 120,
      depositAmount: 500,
      deductions: 0,
      finalAmount: -380,
      approvedAt: APPROVED_AT,
    },
    licenseVerifications: [
      {
        licenseNumber: "DL-VERIFIED-1",
        expiryDate: new Date("2030-01-01T12:00:00.000Z"),
      },
    ],
    ...overrides,
  };
  return row as unknown as TarsContractRow;
}

function reason(error: unknown): string | undefined {
  return error instanceof AppError ? (error.context?.reason as string) : undefined;
}

/** Anything that would mean Diamond copied bytes, secrets or OTP into TARS. */
const FORBIDDEN_KEYS = [
  "base64",
  "bytes",
  "buffer",
  "content",
  "data",
  "file",
  "otp",
  "password",
  "secret",
  "signature",
  "storagekey",
  "token",
];

function collectKeys(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, found);
  } else if (value && typeof value === "object" && !(value instanceof Date)) {
    for (const [key, nested] of Object.entries(value)) {
      found.push(key);
      collectKeys(nested, found);
    }
  }
  return found;
}

function assertNoSensitivePayload(input: unknown, allowed: string[] = []) {
  for (const key of collectKeys(input)) {
    if (allowed.includes(key)) continue;
    const lowered = key.toLowerCase();
    assert.ok(
      !FORBIDDEN_KEYS.some((forbidden) => lowered.includes(forbidden)),
      `normalized TARS input must not carry "${key}"`,
    );
  }
}

const TEST_COMPANY = { id: 1, code: "UNIQUE", displayName: "UNIQUE", accentColor: "#C9A15C" };

describe("tars unconfigured provider", () => {
  test("every mandatory capability fails closed and fabricates nothing", async () => {
    const provider = new TarsUnconfiguredProvider();
    assert.equal(provider.configured, false);

    const results = await Promise.all([
      provider.registerContract(),
      provider.submitContractAcceptance(),
      provider.submitHandover(),
      provider.submitReturn(),
      provider.completeContract(),
    ]);

    for (const result of results) {
      assert.equal(result.success, false);
      assert.equal(result.errorCode, "TARS_NOT_CONFIGURED");
      assert.equal(result.externalContractId, undefined);
      assert.equal(result.externalReference, undefined);
      assert.equal(result.providerOperationId, undefined);
    }
  });

  test("the runtime factory never resolves a configured provider today", () => {
    const provider = createTarsProvider("UNIQUE");
    assert.equal(provider.name, "none");
    assert.equal(provider.configured, false);
  });
});

describe("tars projection", () => {
  test("no integration row reports configured=false and NOT_STARTED everywhere", () => {
    const state = toTarsContractIntegrationState({
      company: TEST_COMPANY,
      configured: false,
      integration: null,
      operations: [],
    });
    assert.equal(state.configured, false);
    assert.equal(state.externalContractId, null);
    assert.equal(state.lastSuccessfulSyncAt, null);
    assert.deepEqual(state.operations, {
      registerContract: "NOT_STARTED",
      contractAcceptance: "NOT_STARTED",
      handover: "NOT_STARTED",
      returnDocumentation: "NOT_STARTED",
      completeContract: "NOT_STARTED",
    });
  });

  test("a failed attempt followed by a successful retry reports SUCCEEDED", () => {
    const state = toTarsContractIntegrationState({
      company: TEST_COMPANY,
      configured: true,
      integration: { externalContractId: "EXT-1", lastSuccessfulSyncAt: APPROVED_AT },
      operations: [
        { operationType: "REGISTER_CONTRACT", status: "FAILED", createdAt: new Date(1) },
        { operationType: "REGISTER_CONTRACT", status: "SUCCEEDED", createdAt: new Date(2) },
      ],
    });
    assert.equal(state.operations.registerContract, "SUCCEEDED");
    assert.equal(state.externalContractId, "EXT-1");
  });

  test("an authoritative success is not downgraded by a later attempt", () => {
    const state = toTarsContractIntegrationState({
      company: TEST_COMPANY,
      configured: true,
      integration: null,
      operations: [
        { operationType: "HANDOVER", status: "SUCCEEDED", createdAt: new Date(1) },
        { operationType: "HANDOVER", status: "FAILED", createdAt: new Date(2) },
      ],
    });
    assert.equal(state.operations.handover, "SUCCEEDED");
  });
});

describe("tars register-contract mapper", () => {
  test("contract, customer, vehicle and rental data come from Diamond models", () => {
    const input = mapRegisterContractInput(contractRow());

    assert.deepEqual(input.contract, {
      contractId: "11111111-1111-4111-8111-111111111111",
      contractNumber: "DE-2026-000123",
      status: "CLOSED",
      termsVersion: "diamond-rental-terms-v1",
    });
    assert.equal(input.customer.customerId, 7);
    assert.equal(input.customer.name, "Omar Test");
    assert.equal(input.customer.identityNumber, "784-1990-123");
    assert.equal(input.vehicle.vehicleId, 42);
    assert.equal(input.vehicle.displayName, "Nissan Patrol");
    assert.equal(input.vehicle.plateNumber, "DXB A 12345");
    assert.equal(input.vehicle.vin, "VIN-TEST-0001");
    assert.deepEqual(input.rental, {
      priceType: "DAILY",
      rentalDays: 3,
      agreedAmount: 1500,
      currency: "AED",
      depositAmount: 500,
      startAt: new Date("2026-03-03T00:00:00.000Z"),
      endAt: new Date("2026-03-06T00:00:00.000Z"),
    });
  });

  test("the verified license wins over the customer-typed license number", () => {
    const input = mapRegisterContractInput(contractRow());
    assert.equal(input.license.number, "DL-VERIFIED-1");
    assert.equal(input.license.expiryDate, "2030-01-01");
  });

  test("without a verification the backend-written customer license is used", () => {
    const input = mapRegisterContractInput(contractRow({ licenseVerifications: [] }));
    assert.equal(input.license.number, "CUSTOMER-TYPED");
    assert.equal(input.license.expiryDate, "2031-05-05");
  });

  test("missing customer and license produce TARS_MAPPING_INCOMPLETE", () => {
    try {
      mapRegisterContractInput(
        contractRow({ customer: null, licenseVerifications: [] }),
      );
      assert.fail("expected TARS_MAPPING_INCOMPLETE");
    } catch (error) {
      assert.equal(reason(error), "TARS_MAPPING_INCOMPLETE");
      assert.deepEqual((error as AppError).context?.missing, [
        "contract.customer",
        "contract.drivingLicense",
      ]);
    }
  });
});

describe("tars handover / return mappers", () => {
  test("handover reads Car-Out and passes Attachment references only", () => {
    const input = mapHandoverInput(contractRow());
    assert.deepEqual(input.handover, {
      occurredAt: CAR_OUT_AT,
      odometer: 12000,
      fuelLevel: "F",
      notes: "clean",
    });
    assert.equal(input.photos.length, 8);
    assert.deepEqual(
      input.photos.map((photo) => photo.angle),
      [...INSPECTION_ANGLES],
    );
    assert.equal(input.photos[0]!.attachmentId, "out-attachment-0");
    assert.equal(
      input.photos[0]!.streamPath,
      "/contracts/11111111-1111-4111-8111-111111111111/car-out/photos/out-photo-0/stream",
    );
    assertNoSensitivePayload(input);
  });

  test("return reads Car-In and passes Attachment references only", () => {
    const input = mapReturnInput(contractRow());
    assert.deepEqual(input.returnDocumentation, {
      occurredAt: CAR_IN_AT,
      odometer: 12480,
      fuelLevel: "1/2",
      notes: null,
    });
    assert.equal(input.photos.length, 8);
    assert.equal(input.photos[3]!.attachmentId, "in-attachment-3");
    assert.equal(
      input.photos[3]!.streamPath,
      "/contracts/11111111-1111-4111-8111-111111111111/car-in/photos/in-photo-3/stream",
    );
    assertNoSensitivePayload(input);
  });

  test("handover and return require the matching inspection to exist", () => {
    assert.equal(
      reason(getError(() => mapHandoverInput(contractRow({ carOut: null })))),
      "TARS_MAPPING_INCOMPLETE",
    );
    assert.equal(
      reason(getError(() => mapReturnInput(contractRow({ carIn: null })))),
      "TARS_MAPPING_INCOMPLETE",
    );
  });
});

describe("tars acceptance and completion mappers", () => {
  test("acceptance maps existing ContractAcceptance without any OTP concept", () => {
    const input = mapContractAcceptanceInput(contractRow());
    assert.deepEqual(input.acceptance, {
      acceptedAt: ACCEPTED_AT,
      termsVersion: "diamond-rental-terms-v1",
      signatureAttachmentId: "signature-attachment-1",
    });
    // The signature is a reference; the attachment id key is the only allowance.
    assertNoSensitivePayload(input, ["signatureAttachmentId"]);
  });

  test("completion is built from the approved reconciliation and close date", () => {
    const input = mapCompleteContractInput(contractRow());
    assert.equal(input.completion.closedAt, CLOSED_AT);
    assert.deepEqual(input.completion.reconciliation, {
      chargesTotal: 120,
      depositAmount: 500,
      deductions: 0,
      finalAmount: -380,
      approvedAt: APPROVED_AT,
    });
  });

  test("an unapproved reconciliation cannot be completed", () => {
    const error = getError(() =>
      mapCompleteContractInput(
        contractRow({
          reconciliation: {
            chargesTotal: 120,
            depositAmount: 500,
            deductions: 0,
            finalAmount: -380,
            approvedAt: null,
          },
        } as Partial<TarsContractRow>),
      ),
    );
    assert.equal(reason(error), "TARS_MAPPING_INCOMPLETE");
    assert.deepEqual((error as AppError).context?.missing, [
      "contract.reconciliation.approvedAt",
    ]);
  });
});

test("buildTarsOperationInput covers exactly the five mandatory procedures", () => {
  const row = contractRow();
  const types = [
    "REGISTER_CONTRACT",
    "CONTRACT_ACCEPTANCE",
    "HANDOVER",
    "RETURN_DOCUMENTATION",
    "COMPLETE_CONTRACT",
  ] as const;
  for (const operationType of types) {
    const input = buildTarsOperationInput(operationType, row);
    assert.equal(input.operationType, operationType);
    assert.equal(input.payload.contract.contractNumber, "DE-2026-000123");
  }
});

function getError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}
