import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { TarsUnconfiguredProvider } from "src/modules/integrations/tars/providers/tars-unconfigured.provider";
import {
  createTarsProvider,
  lastTarsProviderCompanyCode,
  setTarsProviderForTests,
} from "src/modules/integrations/tars/tars.provider";
import {
  isOperationInFlight,
  normalizeOperationStatus,
  toTarsContractIntegrationState,
} from "src/modules/integrations/tars/tars.projection";
import type { TarsProvider } from "src/modules/integrations/tars/tars.types";

const UNIQUE = { id: 1, code: "UNIQUE", displayName: "UNIQUE", accentColor: "#C9A15C" };
const ELITE = { id: 2, code: "ELITE", displayName: "ELITE", accentColor: "#3E5C76" };

describe("TARS official foundation", () => {
  test("routes UNIQUE and ELITE separately with no fallback", () => {
    setTarsProviderForTests(undefined);
    createTarsProvider("UNIQUE");
    assert.equal(lastTarsProviderCompanyCode(), "UNIQUE");
    createTarsProvider("ELITE");
    assert.equal(lastTarsProviderCompanyCode(), "ELITE");
    const unknown = createTarsProvider("UNKNOWN-CO");
    assert.equal(unknown.configured, false);
  });

  test("HTTP 202 acceptance maps to PENDING_PROVIDER, not SUCCEEDED", () => {
    const state = toTarsContractIntegrationState({
      configured: true,
      company: UNIQUE,
      integration: {
        externalContractId: null,
        externalRentalDid: null,
        lastSuccessfulSyncAt: null,
      },
      operations: [
        {
          operationType: "CREATE_RENTAL",
          status: "PENDING_PROVIDER",
          correlationSubject: null,
          createdAt: new Date(),
        },
      ],
    });
    assert.equal(state.operations.createRental, "PENDING_PROVIDER");
    assert.ok(isOperationInFlight("PENDING_PROVIDER"));
  });

  test("legacy PENDING/PROCESSING normalize to SUBMITTING", () => {
    assert.equal(normalizeOperationStatus("PENDING"), "SUBMITTING");
    assert.equal(normalizeOperationStatus("PROCESSING"), "SUBMITTING");
  });

  test("repeatable UPDATE_RENTAL keeps separate correlation subjects", () => {
    const state = toTarsContractIntegrationState({
      configured: true,
      company: ELITE,
      integration: null,
      operations: [
        {
          operationType: "UPDATE_RENTAL",
          status: "SUCCEEDED",
          correlationSubject: "renewal-a",
          createdAt: new Date(1),
        },
        {
          operationType: "UPDATE_RENTAL",
          status: "PENDING_PROVIDER",
          correlationSubject: "renewal-b",
          createdAt: new Date(2),
        },
      ],
    });
    assert.equal(state.operations.updateRental, "PENDING_PROVIDER");
  });

  test("unconfigured provider fails closed for OTP", async () => {
    const provider = new TarsUnconfiguredProvider("UNIQUE");
    const request = await provider.requestContractOtp({
      company: { companyId: 1, companyCode: "UNIQUE" },
      contract: {
        contractId: "c-1",
        contractNumber: "DE-1",
        status: "FORM",
        termsVersion: "v1",
      },
      customerMobile: "+971500000001",
    });
    assert.equal(request.success, false);
    const verify = await provider.verifyContractOtp({
      company: { companyId: 1, companyCode: "UNIQUE" },
      contract: {
        contractId: "c-1",
        contractNumber: "DE-1",
        status: "FORM",
        termsVersion: "v1",
      },
      challengeReference: "ch-1",
      code: "1234",
    });
    assert.equal(verify.success, false);
  });

  test("fake provider async acceptance is not immediate success", async () => {
    const provider: TarsProvider = {
      name: "fake",
      companyCode: "UNIQUE",
      configured: true,
      checkAuthReadiness: async () => ({ ready: true }),
      lookupVehicle: async () => ({ success: false }),
      registerVehicleIfRequired: async () => ({ success: false }),
      inquireDrivingLicense: async () => ({ success: false }),
      uploadAttachment: async () => ({ success: false }),
      submitHandoverEvidence: async () => ({ success: true }),
      submitReturnEvidence: async () => ({ success: true }),
      linkDigitalAcceptance: async () => ({ success: true }),
      createRental: async () => ({
        accepted: true,
        providerRequestId: "req-202",
      }),
      updateRental: async () => ({ success: true }),
      returnRental: async () => ({ success: true }),
      settleRental: async () => ({ success: true }),
      getAsyncRequestStatus: async () => ({ status: "SUCCEEDED", externalRentalDid: "did-1" }),
      requestContractOtp: async () => ({
        success: true,
        challengeReference: "otp-ch",
        maskedDestination: "***45",
      }),
      verifyContractOtp: async () => ({ success: true, verifiedAt: new Date() }),
      registerContract: async () => ({ success: true }),
      submitContractAcceptance: async () => ({ success: true }),
      submitHandover: async () => ({ success: true }),
      submitReturn: async () => ({ success: true }),
      completeContract: async () => ({ success: true }),
    };
    const result = await provider.createRental({
      company: { companyId: 1, companyCode: "UNIQUE" },
      contract: {
        contractId: "c-1",
        contractNumber: "DE-1",
        status: "PAID",
        termsVersion: "v1",
      },
      customer: {
        customerId: 1,
        name: "Test",
        type: "INDIVIDUAL",
        mobile: "+971500000001",
        email: null,
        nationality: "AE",
        identityNumber: null,
        passportNumber: null,
        address: null,
      },
      vehicle: {
        vehicleId: 1,
        displayName: "Car",
        plateNumber: "A 1",
        vin: null,
        modelName: null,
        modelYear: 2024,
        color: "White",
        externalVehicleDid: null,
      },
      rental: {
        priceType: "DAILY",
        rentalDays: 1,
        agreedAmount: 100,
        currency: "AED",
        depositAmount: null,
        startAt: new Date(),
        endAt: new Date(),
      },
      license: { number: "DL-1", expiryDate: "2030-01-01" },
    });
    assert.equal(result.accepted, true);
    assert.equal(result.success, undefined);
    assert.equal(result.providerRequestId, "req-202");
  });
});
