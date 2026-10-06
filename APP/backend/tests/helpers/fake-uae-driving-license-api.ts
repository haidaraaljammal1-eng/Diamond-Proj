import type {
  UaeDrivingLicenseApiClientErrorCode,
  UaeDrivingLicenseEngineOutcome,
} from "src/modules/document-engine/uae-driving-license-api.types";
import { setUaeDrivingLicenseApiClientForTests } from "src/modules/document-engine/uae-driving-license-api.client";

export type FakeLicenseEngineResponder = () =>
  Promise<UaeDrivingLicenseEngineOutcome> | UaeDrivingLicenseEngineOutcome;

const ACCEPT_BODY = {
  job_id: "fake-job-accept",
  document_status: "ACCEPT" as const,
  fields: {
    license_number: {
      value: "90527",
      status: "ACCEPT",
      crop_status: "VALUE_OK",
      ocr_eligible: true,
      confidence: 0.9,
      engine: "tesseract",
    },
    name_en: {
      value: "TEST DRIVER",
      status: "ACCEPT",
      ocr_eligible: true,
      confidence: 0.85,
      engine: "rapidocr_ppocrv5_en",
    },
    nationality: {
      value: "INDIA",
      status: "ACCEPT",
      ocr_eligible: true,
      confidence: 0.88,
      engine: "tesseract",
    },
    date_of_birth: {
      value: "03-05-1990",
      status: "ACCEPT",
      ocr_eligible: true,
      confidence: 0.9,
      engine: "date_policy",
    },
    issue_date: {
      value: "01-01-2020",
      status: "ACCEPT",
      ocr_eligible: true,
      confidence: 0.9,
      engine: "date_policy",
    },
    expiry_date: {
      value: "01-01-2030",
      status: "ACCEPT",
      ocr_eligible: true,
      confidence: 0.9,
      engine: "date_policy",
    },
    place_of_issue: {
      value: "DUBAI",
      status: "ACCEPT",
      ocr_eligible: true,
      confidence: 0.8,
      engine: "tesseract",
    },
    name_ar: { value: null, status: "NOT_OCR_PROCESSED", ocr_eligible: false },
  },
  runtime_ms: { crop: 100, ocr: 200, total: 300 },
};

let extractCallCount = 0;

export function getFakeUaeDrivingLicenseExtractCallCount(): number {
  return extractCallCount;
}

export function resetFakeUaeDrivingLicenseExtractCallCount(): void {
  extractCallCount = 0;
}

let responder: FakeLicenseEngineResponder = () => ({
  kind: "business",
  body: ACCEPT_BODY,
  provider: "uae-driving-license-engine-test",
  providerVersion: "test",
});

export function createFakeUaeDrivingLicenseApi() {
  return {
    setAccept(overrides?: Partial<typeof ACCEPT_BODY["fields"]>) {
      responder = () => ({
        kind: "business",
        body: {
          ...ACCEPT_BODY,
          fields: { ...ACCEPT_BODY.fields, ...overrides },
        },
        provider: "uae-driving-license-engine-test",
        providerVersion: "test",
      });
    },
    setReviewRequired() {
      responder = () => ({
        kind: "business",
        body: {
          ...ACCEPT_BODY,
          document_status: "REVIEW_REQUIRED",
          fields: {
            ...ACCEPT_BODY.fields,
            license_number: {
              value: "90527",
              status: "ACCEPT",
              confidence: 0.9,
              engine: "tesseract",
            },
            expiry_date: {
              value: null,
              status: "REJECT",
              confidence: null,
              engine: "date_policy",
            },
          },
        },
        provider: "uae-driving-license-engine-test",
        providerVersion: "test",
      });
    },
    setError(code: UaeDrivingLicenseApiClientErrorCode) {
      responder = () => ({
        kind: "error",
        code,
        provider: "uae-driving-license-engine-test",
        providerVersion: "test",
      });
    },
    setResponder(fn: FakeLicenseEngineResponder) {
      responder = fn;
    },
    async install() {
      resetFakeUaeDrivingLicenseExtractCallCount();
      setUaeDrivingLicenseApiClientForTests({
        extract: async () => {
          extractCallCount += 1;
          return responder();
        },
        health: async () => ({ status: "READY", service: "uae-license-api" }),
      });
    },
    async clear() {
      setUaeDrivingLicenseApiClientForTests(undefined);
      resetFakeUaeDrivingLicenseExtractCallCount();
      responder = () => ({
        kind: "business",
        body: ACCEPT_BODY,
        provider: "uae-driving-license-engine-test",
        providerVersion: "test",
      });
    },
  };
}
