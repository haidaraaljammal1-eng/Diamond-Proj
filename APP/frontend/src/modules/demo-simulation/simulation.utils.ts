import type { PublicRentalContext } from "@/modules/public-rental/types/public-rental.types";
import type { ContractTarsStateDto } from "@/modules/contracts/types/tars.types";
import {
  deriveIdentityReady,
  identityLicenseStatus,
} from "../public-rental/utils/passport-view.ts";
import {
  DEMO_LICENSE_EXPIRED,
  DEMO_LICENSE_VALID,
  DEMO_PASSPORT_READY,
  DEMO_PAYMENT_REFERENCE,
  DEMO_TARS_PRESETS,
} from "./simulation.fixtures.ts";
import type {
  SimulatedLicenseScenario,
  SimulatedLicenseState,
  SimulatedPassportScenario,
  SimulatedPassportState,
  SimulatedPaymentScenario,
  SimulatedPaymentState,
  SimulatedTarsPreset,
  SimulationSnapshot,
} from "./simulation.types";

export function licenseSimulationResult(scenario: SimulatedLicenseScenario): {
  license: SimulatedLicenseState;
  flowStep: SimulationSnapshot["flowStep"];
} {
  if (scenario === "valid") {
    return {
      license: {
        verifying: false,
        scenario,
        status: "VALID",
        licenseNumber: DEMO_LICENSE_VALID.licenseNumber,
        expiryDate: DEMO_LICENSE_VALID.expiryDate,
      },
      // Not CONTRACT: like the Backend, the contract step needs the passport too.
      // The overlay derives the step from the normalized identity.
      flowStep: null,
    };
  }
  if (scenario === "expired") {
    return {
      license: {
        verifying: false,
        scenario,
        status: "EXPIRED",
        licenseNumber: DEMO_LICENSE_EXPIRED.licenseNumber,
        expiryDate: DEMO_LICENSE_EXPIRED.expiryDate,
      },
      flowStep: "LICENSE_VERIFICATION",
    };
  }
  return {
    license: {
      verifying: false,
      scenario,
      status: "UNREADABLE",
      licenseNumber: null,
      expiryDate: null,
    },
    flowStep: "LICENSE_VERIFICATION",
  };
}

/** Simulated passport OCR result in the normalized identity shape. */
export function passportSimulationResult(scenario: SimulatedPassportScenario): SimulatedPassportState {
  if (scenario === "ready") {
    return { processing: false, scenario, status: "READY", fields: { ...DEMO_PASSPORT_READY } };
  }
  return { processing: false, scenario, status: "NOT_RECOGNIZED", fields: null };
}

export function paymentSimulationPhase(
  scenario: SimulatedPaymentScenario,
  phase: "processing" | "pending" | "failed" | "confirmed" | "handover",
): {
  payment: SimulatedPaymentState;
  flowStep: SimulationSnapshot["flowStep"];
  contractStatus: SimulationSnapshot["contractStatus"];
} {
  const base = {
    scenario,
    reference: DEMO_PAYMENT_REFERENCE,
  };
  if (phase === "processing") {
    return {
      payment: { ...base, status: "PROCESSING", payPending: true },
      flowStep: "PAYMENT",
      contractStatus: "SIGNED",
    };
  }
  if (phase === "failed") {
    return {
      payment: { ...base, status: "FAILED", payPending: false },
      flowStep: "PAYMENT",
      contractStatus: "SIGNED",
    };
  }
  if (phase === "pending") {
    return {
      payment: { ...base, status: "PENDING", payPending: false },
      flowStep: "PAYMENT",
      contractStatus: "SIGNED",
    };
  }
  if (phase === "confirmed") {
    return {
      payment: { ...base, status: "CONFIRMED", payPending: false },
      flowStep: "PAYMENT",
      contractStatus: "SIGNED",
    };
  }
  return {
    payment: { ...base, status: "CONFIRMED", payPending: false },
    flowStep: "READY_FOR_HANDOVER",
    contractStatus: "PAID",
  };
}

function maskLicense(value: string | null): string | null {
  if (!value) return null;
  if (value.length < 8) return value;
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

/** Overlay presentation-only provider/results. Commercial fields stay from Backend. */
export function applyRentalSimulation(
  real: PublicRentalContext,
  snapshot: SimulationSnapshot,
): PublicRentalContext {
  const licenseStatus = snapshot.license.status;
  const licenseNumber =
    licenseStatus != null ? snapshot.license.licenseNumber : real.licenseVerification.licenseNumber;
  const expiryDate =
    licenseStatus != null ? snapshot.license.expiryDate : real.licenseVerification.expiryDate;

  const customer = snapshot.customer
    ? {
        name: snapshot.customer.name,
        mobile: snapshot.customer.mobile,
        email: snapshot.customer.email,
        nationality: snapshot.customer.nationality,
        identityNumber: snapshot.customer.identityNumber,
        passportNumber: snapshot.customer.passportNumber || null,
        address: snapshot.customer.address,
        drivingLicenseNumber: licenseNumber ?? real.customer?.drivingLicenseNumber ?? null,
        drivingLicenseExpiry: expiryDate ?? real.customer?.drivingLicenseExpiry ?? null,
      }
    : real.customer
      ? {
          ...real.customer,
          drivingLicenseNumber: licenseNumber ?? real.customer.drivingLicenseNumber,
          drivingLicenseExpiry: expiryDate ?? real.customer.drivingLicenseExpiry,
        }
      : licenseStatus
        ? {
            name: "",
            mobile: null,
            email: null,
            nationality: null,
            identityNumber: null,
            passportNumber: null,
            address: null,
            drivingLicenseNumber: licenseNumber,
            drivingLicenseExpiry: expiryDate,
          }
        : real.customer;

  const paymentActive = snapshot.payment.status != null || snapshot.payment.payPending;

  // Normalized identity: simulated documents produce the same shape and the
  // same readiness rule as real Backend data. No "simulation → continue" bypass.
  const identityOverlay = licenseStatus != null || snapshot.passport.status != null;
  const effectiveLicenseStatus = identityLicenseStatus(licenseStatus ?? real.licenseVerification.status);
  const passport =
    snapshot.passport.status != null
      ? { status: snapshot.passport.status, fields: snapshot.passport.fields }
      : real.identity.passport;
  const identity = identityOverlay
    ? {
        licenseStatus: effectiveLicenseStatus,
        passport,
        identityReady: deriveIdentityReady(effectiveLicenseStatus, passport.status),
      }
    : real.identity;
  const derivedStep =
    identityOverlay && real.flow.step === "LICENSE_VERIFICATION"
      ? identity.identityReady
        ? "CONTRACT"
        : "LICENSE_VERIFICATION"
      : real.flow.step;

  return {
    ...real,
    flow: { step: snapshot.flowStep ?? derivedStep },
    identity,
    contract: {
      ...real.contract,
      status: snapshot.contractStatus ?? real.contract.status,
    },
    customer,
    licenseVerification:
      licenseStatus == null
        ? real.licenseVerification
        : {
            status: licenseStatus,
            licenseNumber,
            licenseNumberMasked: maskLicense(licenseNumber),
            expiryDate,
            confidence: licenseStatus === "VALID" ? 0.99 : null,
          },
    payment: paymentActive
      ? {
          ...real.payment,
          status: snapshot.payment.status,
          method: "CARD",
          providerAvailable: true,
          amount: real.rental.agreedAmount,
          currency: real.rental.currency,
        }
      : real.payment,
  };
}

export function applyTarsSimulation(
  real: ContractTarsStateDto | null,
  preset: SimulatedTarsPreset | null,
): ContractTarsStateDto | null {
  if (!preset) return real;
  return DEMO_TARS_PRESETS[preset];
}

export function isSimulationOverlayActive(snapshot: SimulationSnapshot): boolean {
  return snapshot.active;
}

/** Keep the license UI visible so Continue can be demonstrated after a VALID overlay. */
export function shouldHoldLicenseStage(
  snapshot: SimulationSnapshot,
  viewStage: "license" | "contract" | "payment" | "handover" | null,
  allowed: "license" | "contract" | "payment" | "handover",
): boolean {
  if (allowed === "payment" || allowed === "handover") return false;
  if (viewStage === "contract" || viewStage === "payment" || viewStage === "handover") {
    return false;
  }
  return (
    snapshot.license.verifying ||
    snapshot.license.status != null ||
    snapshot.passport.processing ||
    snapshot.passport.status != null
  );
}
