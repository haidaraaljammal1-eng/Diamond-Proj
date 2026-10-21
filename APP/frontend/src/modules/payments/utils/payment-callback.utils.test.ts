import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import type { PaymentStatusDto } from "../types/payment.types.ts";
import {
  isPaymentCallbackVerified,
  isRenewalPaymentSuccess,
  isRentalPaymentSuccess,
  resolveCallbackMessage,
  shouldShowRentalHandoverCopy,
} from "./payment-callback.utils.ts";

const here = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(here, "..", "..", "..", "..", "messages");

function loadMessages(locale: "ar" | "en"): Record<string, unknown> {
  return JSON.parse(readFileSync(join(messagesDir, `${locale}.json`), "utf8")) as Record<
    string,
    unknown
  >;
}

function callbackT(locale: "ar" | "en"): (key: string) => string {
  const root = loadMessages(locale);
  const payments = root.Payments as Record<string, unknown>;
  const callback = payments.callback as Record<string, string>;
  return (key: string) => callback[key] ?? key;
}

function status(partial: Partial<PaymentStatusDto>): PaymentStatusDto {
  return {
    status: "CONFIRMED",
    contractStatus: "ACTIVE",
    purpose: "RENTAL",
    summary: {
      contractNumber: "C-1",
      vehicle: { displayName: "Sedan", plateNumber: "A 1" },
      amount: 100,
      currency: "AED",
      cardLast4: "4242",
      cardBrand: "Visa",
    },
    ...partial,
  };
}

describe("payment callback copy", () => {
  it("CONFIRMED + RENTAL + PAID shows rental handover copy in AR/EN", () => {
    const dto = status({ purpose: "RENTAL", contractStatus: "PAID" });
    assert.equal(isRentalPaymentSuccess(dto), true);
    assert.equal(shouldShowRentalHandoverCopy(dto), true);
    assert.equal(resolveCallbackMessage(dto, null, "tok", callbackT("ar")), "تم الدفع بنجاح");
    assert.equal(
      callbackT("ar")("readyForHandover"),
      "عقد الإيجار جاهز لتسليم المركبة.",
    );
    assert.equal(
      callbackT("en")("readyForHandover"),
      "Your rental is ready for vehicle handover.",
    );
  });

  it("CONFIRMED + RENEWAL shows renewal success without rental handover", () => {
    const dto = status({ purpose: "RENEWAL", contractStatus: "ACTIVE" });
    assert.equal(isPaymentCallbackVerified(dto), true);
    assert.equal(isRenewalPaymentSuccess(dto), true);
    assert.equal(shouldShowRentalHandoverCopy(dto), false);

    const ar = callbackT("ar");
    const en = callbackT("en");
    assert.equal(
      resolveCallbackMessage(dto, null, "tok", ar),
      "تم دفع قيمة التجديد وتأكيد التمديد بنجاح.",
    );
    assert.equal(
      resolveCallbackMessage(dto, null, "tok", en),
      "Renewal payment confirmed and the contract extension was applied successfully.",
    );
    assert.equal(ar("renewalExtensionApplied"), "تم تطبيق التمديد على مدة العقد بنجاح.");
    assert.equal(en("renewalExtensionApplied"), "The rental period has been extended successfully.");
    assert.notEqual(ar("renewalSuccess"), ar("readyForHandover"));
  });

  it("PENDING / PROCESSING / FAILED / CANCELLED keep existing messages", () => {
    const t = callbackT("en");
    assert.equal(
      resolveCallbackMessage(status({ status: "PENDING" }), null, "tok", t),
      t("checking"),
    );
    assert.equal(
      resolveCallbackMessage(status({ status: "PROCESSING" }), null, "tok", t),
      t("checking"),
    );
    assert.equal(
      resolveCallbackMessage(status({ status: "FAILED" }), null, "tok", t),
      t("failed"),
    );
    assert.equal(
      resolveCallbackMessage(status({ status: "CANCELLED" }), null, "tok", t),
      t("cancelled"),
    );
  });

  it("CONFIRMED + RENTAL without PAID stays in checking state", () => {
    const dto = status({ purpose: "RENTAL", contractStatus: "SIGNED" });
    assert.equal(isPaymentCallbackVerified(dto), false);
    assert.equal(resolveCallbackMessage(dto, null, "tok", callbackT("en")), "Confirming your payment…");
  });
});
