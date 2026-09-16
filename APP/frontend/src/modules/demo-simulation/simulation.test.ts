import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { publicRentalFormSchema } from "../public-rental/schemas/public-rental-form.schema.ts";
import type { PublicRentalContext } from "../public-rental/types/public-rental.types.ts";
import {
  DEMO_CUSTOMER,
  DEMO_LICENSE_VALID,
  DEMO_PAYMENT_REFERENCE,
  DEMO_TARS_PRESETS,
} from "./simulation.fixtures.ts";
import { isDemoSimulationEnabled, shouldSkipRentalMutation } from "./simulation.enabled.ts";
import { DEMO_SIMULATION_DELAYS } from "./simulation.types.ts";
import {
  applyRentalSimulation,
  applyTarsSimulation,
  licenseSimulationResult,
  paymentSimulationPhase,
  shouldHoldLicenseStage,
} from "./simulation.utils.ts";
import type { SimulationSnapshot } from "./simulation.types.ts";

const idle: SimulationSnapshot = {
  active: false,
  generation: 0,
  flowStep: null,
  contractStatus: null,
  license: {
    verifying: false,
    scenario: "valid",
    status: null,
    licenseNumber: null,
    expiryDate: null,
  },
  customer: null,
  formPending: false,
  acceptPending: false,
  payment: {
    scenario: "success",
    status: null,
    payPending: false,
    reference: null,
  },
  tarsPreset: null,
  gpsOverlay: null,
  roadLiabilitiesOverlay: null,
  financeOverlay: null,
};

const realContext: PublicRentalContext = {
  office: { displayName: "Diamond Rent Car — Marina" },
  flow: { step: "LICENSE_VERIFICATION" },
  contract: {
    contractNumber: "DE-2026-000411",
    status: "AWAITING",
    termsVersion: "diamond-rental-terms-v1",
  },
  vehicle: {
    displayName: "BMW 730Li",
    vehicleType: "Luxury",
    plateNumber: "A 12345",
    modelYear: 2024,
    color: "Black",
    vin: "WBAXXXXDEMO12345",
  },
  rental: {
    rentalDays: 7,
    agreedAmount: 3500,
    currency: "AED",
    startAt: "2026-09-12T08:00:00.000Z",
    endAt: "2026-09-19T08:00:00.000Z",
    actualPickupAt: null,
    actualReturnAt: null,
  },
  customer: null,
  licenseVerification: {
    status: "PROVIDER_UNAVAILABLE",
    licenseNumber: null,
    licenseNumberMasked: null,
    expiryDate: null,
    confidence: null,
  },
  payment: {
    status: null,
    method: null,
    amount: 3500,
    currency: "AED",
    providerAvailable: false,
  },
};

describe("demo simulation flag", () => {
  it("is hidden unless the dedicated env flag is the string true", () => {
    assert.equal(isDemoSimulationEnabled(undefined), false);
    assert.equal(isDemoSimulationEnabled("false"), false);
    assert.equal(isDemoSimulationEnabled("1"), false);
    assert.equal(isDemoSimulationEnabled("true"), true);
  });

  it("does not infer enablement from NODE_ENV", () => {
    const source = readFileSync(path.join(import.meta.dirname, "simulation.enabled.ts"), "utf8");
    assert.ok(source.includes("NEXT_PUBLIC_DEMO_SIMULATION_ENABLED"));
    assert.ok(source.includes('flag === "true"'));
    assert.equal(source.includes("process.env.NODE_ENV"), false);
  });
});

describe("simulation button visibility contract", () => {
  it("renders nothing when the flag is disabled", () => {
    const source = readFileSync(
      path.join(import.meta.dirname, "components/simulation-button/simulation-button.tsx"),
      "utf8",
    );
    assert.ok(source.includes("if (!simulation.enabled) return null"));
  });
});

describe("applyRentalSimulation", () => {
  it("keeps Backend commercial fields as display authority", () => {
    const result = licenseSimulationResult("valid");
    const overlay: SimulationSnapshot = {
      ...idle,
      active: true,
      flowStep: result.flowStep,
      license: result.license,
    };
    const next = applyRentalSimulation(realContext, overlay);
    assert.equal(next.rental.agreedAmount, 3500);
    assert.equal(next.rental.currency, "AED");
    assert.equal(next.rental.rentalDays, 7);
    assert.equal(next.contract.contractNumber, "DE-2026-000411");
    assert.equal(next.vehicle.plateNumber, "A 12345");
    assert.equal(next.office.displayName, "Diamond Rent Car — Marina");
    assert.equal(next.licenseVerification.status, "VALID");
    assert.equal(next.licenseVerification.licenseNumber, "DXB-DEMO-482731");
  });

  it("does not invent a payment provider until payment overlay starts", () => {
    const next = applyRentalSimulation(realContext, { ...idle, active: true });
    assert.equal(next.payment.providerAvailable, false);
    assert.equal(next.payment.amount, 3500);
  });
});

describe("license simulation", () => {
  it("VALID produces local verification and CONTRACT step", () => {
    const result = licenseSimulationResult("valid");
    assert.equal(result.license.status, "VALID");
    assert.equal(result.license.licenseNumber, DEMO_LICENSE_VALID.licenseNumber);
    assert.equal(result.flowStep, "CONTRACT");
    const next = applyRentalSimulation(realContext, {
      ...idle,
      active: true,
      license: result.license,
      flowStep: result.flowStep,
    });
    assert.equal(next.flow.step, "CONTRACT");
    assert.equal(next.licenseVerification.status, "VALID");
  });

  it("EXPIRED stays on license verification", () => {
    const result = licenseSimulationResult("expired");
    assert.equal(result.license.status, "EXPIRED");
    assert.equal(result.flowStep, "LICENSE_VERIFICATION");
  });

  it("UNREADABLE stays on license verification", () => {
    const result = licenseSimulationResult("unreadable");
    assert.equal(result.license.status, "UNREADABLE");
    assert.equal(result.license.licenseNumber, null);
    assert.equal(result.flowStep, "LICENSE_VERIFICATION");
  });

  it("holds the license UI so Continue can be demonstrated after VALID", () => {
    const result = licenseSimulationResult("valid");
    const snapshot: SimulationSnapshot = {
      ...idle,
      active: true,
      flowStep: result.flowStep,
      license: result.license,
    };
    assert.equal(shouldHoldLicenseStage(snapshot, null, "contract"), true);
    assert.equal(shouldHoldLicenseStage(snapshot, "contract", "contract"), false);
  });
});

describe("contract simulation", () => {
  it("fills demo customer values that still pass existing validation", () => {
    const parsed = publicRentalFormSchema.parse(DEMO_CUSTOMER);
    assert.equal(parsed.name, "Demo Customer");
    assert.equal(parsed.mobile, "050 123 4567");
  });

  it("still rejects empty customer fields", () => {
    assert.equal(
      publicRentalFormSchema.safeParse({
        name: "",
        mobile: "",
        email: "",
        nationality: "",
        identityNumber: "",
        passportNumber: "",
        address: "",
      }).success,
      false,
    );
  });

  it("simulated acceptance advances locally to PAYMENT", () => {
    const next = applyRentalSimulation(realContext, {
      ...idle,
      active: true,
      customer: DEMO_CUSTOMER,
      contractStatus: "SIGNED",
      flowStep: "PAYMENT",
    });
    assert.equal(next.contract.status, "SIGNED");
    assert.equal(next.flow.step, "PAYMENT");
    assert.equal(next.customer?.name, "Demo Customer");
  });
});

describe("payment simulation", () => {
  it("success walks PROCESSING → PENDING → CONFIRMED → READY_FOR_HANDOVER", () => {
    const processing = paymentSimulationPhase("success", "processing");
    const pending = paymentSimulationPhase("success", "pending");
    const confirmed = paymentSimulationPhase("success", "confirmed");
    const handover = paymentSimulationPhase("success", "handover");
    assert.equal(processing.payment.status, "PROCESSING");
    assert.equal(pending.payment.status, "PENDING");
    assert.equal(confirmed.payment.status, "CONFIRMED");
    assert.equal(confirmed.flowStep, "PAYMENT");
    assert.equal(handover.flowStep, "READY_FOR_HANDOVER");
    assert.equal(handover.contractStatus, "PAID");
    assert.equal(handover.payment.reference, DEMO_PAYMENT_REFERENCE);
    assert.equal(DEMO_PAYMENT_REFERENCE.startsWith("pi_"), false);
    const next = applyRentalSimulation(realContext, {
      ...idle,
      active: true,
      flowStep: handover.flowStep,
      contractStatus: handover.contractStatus,
      payment: handover.payment,
    });
    assert.equal(next.rental.agreedAmount, 3500);
    assert.equal(next.payment.amount, 3500);
    assert.equal(next.flow.step, "READY_FOR_HANDOVER");
  });

  it("FAILED stops after PROCESSING", () => {
    const failed = paymentSimulationPhase("failed", "failed");
    assert.equal(failed.payment.status, "FAILED");
    assert.equal(failed.flowStep, "PAYMENT");
  });

  it("PENDING remains pending", () => {
    const pending = paymentSimulationPhase("pending", "pending");
    assert.equal(pending.payment.status, "PENDING");
    assert.equal(pending.flowStep, "PAYMENT");
  });
});

describe("TARS simulation", () => {
  it("renders presentation presets without writing operations", () => {
    const synced = applyTarsSimulation(null, "synced");
    assert.equal(synced?.operations.registerContract, "SUCCEEDED");
    assert.equal(synced?.operations.contractAcceptance, "SUCCEEDED");
    assert.equal(synced?.operations.handover, "SUCCEEDED");
    assert.equal(synced?.operations.returnDocumentation, "NOT_STARTED");
    assert.equal(synced?.operations.completeContract, "NOT_STARTED");

    const failed = applyTarsSimulation(null, "partialFailure");
    assert.equal(failed?.operations.handover, "FAILED");
    assert.equal(failed?.operations.registerContract, "SUCCEEDED");

    const notStarted = applyTarsSimulation(null, "notStarted");
    assert.equal(notStarted?.operations.handover, "NOT_STARTED");

    const syncing = applyTarsSimulation(null, "syncing");
    assert.equal(syncing?.operations.contractAcceptance, "PROCESSING");
  });

  it("inline handover follows the simulated preset", () => {
    const overlay = applyTarsSimulation(
      {
        configured: false,
        externalContractId: null,
        lastSuccessfulSyncAt: null,
        operations: DEMO_TARS_PRESETS.notStarted.operations,
      },
      "partialFailure",
    );
    assert.equal(overlay?.operations.handover, "FAILED");
  });
});

describe("reset and persistence", () => {
  it("reset restores Backend-derived rental context", () => {
    const overlay: SimulationSnapshot = {
      ...idle,
      active: true,
      ...licenseSimulationResult("valid"),
      tarsPreset: "synced",
    };
    const simulated = applyRentalSimulation(realContext, overlay);
    assert.equal(simulated.flow.step, "CONTRACT");
    const restored = applyRentalSimulation(realContext, idle);
    assert.equal(restored.flow.step, "LICENSE_VERIFICATION");
    assert.equal(restored.licenseVerification.status, "PROVIDER_UNAVAILABLE");
  });

  it("never persists to localStorage, sessionStorage, or zustand persist", () => {
    const storeSource = readFileSync(path.join(import.meta.dirname, "simulation.store.ts"), "utf8");
    assert.equal(storeSource.includes("localStorage"), false);
    assert.equal(storeSource.includes("sessionStorage"), false);
    assert.equal(storeSource.includes("zustand/middleware"), false);
    assert.equal(storeSource.includes("persist("), false);
    assert.ok(storeSource.includes("gpsOverlay"));
    assert.ok(storeSource.includes("simulateGps"));
    assert.ok(storeSource.includes("roadLiabilitiesOverlay"));
    assert.ok(storeSource.includes("simulateRoadLiabilities"));
    assert.ok(storeSource.includes("financeOverlay"));
    assert.ok(storeSource.includes("simulateFinance"));
    assert.equal(storeSource.includes("gps.api"), false);
    assert.equal(/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(storeSource), false);
  });
});

describe("no backend mutation from simulation", () => {
  it("skips rental mutations while simulation is active", () => {
    assert.equal(shouldSkipRentalMutation(true), true);
    assert.equal(shouldSkipRentalMutation(false), false);
  });

  it("public rental screen intercepts OCR, form, accept, and payment", () => {
    const source = readFileSync(
      path.join(
        import.meta.dirname,
        "../public-rental/components/public-rental-screen/public-rental-screen.tsx",
      ),
      "utf8",
    );
    assert.ok(source.includes("shouldSkipRentalMutation"));
    assert.ok(source.includes("simulateFormSubmit"));
    assert.ok(source.includes("simulateAccept"));
    assert.ok(source.includes("simulatePayment"));
    assert.ok(source.includes("uploadLicense"));
  });

  it("TARS components add no POST, no Retry, and no execute control", () => {
    const strip = (source: string) =>
      source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const status = strip(
      readFileSync(
        path.join(
          import.meta.dirname,
          "../contracts/components/contract-tars/contract-tars-status.tsx",
        ),
        "utf8",
      ),
    );
    const inline = strip(
      readFileSync(
        path.join(
          import.meta.dirname,
          "../contracts/components/contract-tars/contract-tars-inline-status.tsx",
        ),
        "utf8",
      ),
    );
    const api = readFileSync(
      path.join(import.meta.dirname, "../contracts/api/tars.api.ts"),
      "utf8",
    );
    for (const source of [status, inline]) {
      assert.equal(/\b(retry|resync|execute|syncNow)\b/i.test(source), false);
    }
    assert.equal(/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(api), false);
    assert.ok(status.includes("SimulationButton"));
    assert.equal(inline.includes("SimulationButton"), false);
  });
});

describe("simulation delays", () => {
  it("keeps license and payment delays in the presentation range", () => {
    assert.ok(DEMO_SIMULATION_DELAYS.licenseMs >= 800);
    assert.ok(DEMO_SIMULATION_DELAYS.licenseMs <= 1500);
    assert.ok(DEMO_SIMULATION_DELAYS.paymentProcessingMs >= 1000);
    assert.ok(DEMO_SIMULATION_DELAYS.paymentPendingMs >= 1000);
  });
});
