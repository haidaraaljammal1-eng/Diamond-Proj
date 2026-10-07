import type { PassportNumberEngineOutcome } from "src/modules/document-engine/passport-number-api.types";
import { setPassportNumberApiClientForTests } from "src/modules/document-engine/passport-number-api.client";

export const SYNTHETIC_PASSPORT_NUMBER = "TEST123456";

export type FakePassportResponder = () => Promise<PassportNumberEngineOutcome> | PassportNumberEngineOutcome;

let passportResponder: FakePassportResponder = () => ({
  kind: "business",
  status: "VALID",
  passportNumber: SYNTHETIC_PASSPORT_NUMBER,
  provider: "passport-number-engine-test",
  providerVersion: "test",
});

export function createFakePassportNumberApi() {
  return {
    setPassport(fields: { passportNumber?: string | null; status?: "VALID" | "REVIEW" }) {
      passportResponder = () => {
        if (fields.status === "REVIEW" || fields.passportNumber === null) {
          return {
            kind: "business",
            status: "REVIEW",
            provider: "passport-number-engine-test",
            providerVersion: "test",
          };
        }
        return {
          kind: "business",
          status: "VALID",
          passportNumber: fields.passportNumber ?? SYNTHETIC_PASSPORT_NUMBER,
          provider: "passport-number-engine-test",
          providerVersion: "test",
        };
      };
    },
    setResponder(fn: FakePassportResponder) {
      passportResponder = fn;
    },
    async install() {
      setPassportNumberApiClientForTests(async () => passportResponder());
    },
    async clear() {
      setPassportNumberApiClientForTests(undefined);
      passportResponder = () => ({
        kind: "business",
        status: "VALID",
        passportNumber: SYNTHETIC_PASSPORT_NUMBER,
        provider: "passport-number-engine-test",
        providerVersion: "test",
      });
    },
  };
}
