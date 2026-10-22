import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { createTranslator } from "use-intl";
import { formatRentalDuration } from "../../contracts/utils/format-rental-duration.ts";

type DurationTranslator = (
  key: "hours" | "days" | "weeks" | "months",
  values: { count: number },
) => string;

function asDurationTranslator(
  translator: ReturnType<typeof createTranslator>,
): DurationTranslator {
  return (key, values) => translator(key, values);
}
import type { PublicRenewalOffer, PublicRenewalView } from "../types/public-renewal.types.ts";
import {
  publicRenewalCurrentDuration,
  publicRenewalExtensionDuration,
} from "./public-renewal-duration.ts";

function readMessages(locale: "ar" | "en"): Record<string, unknown> {
  return JSON.parse(
    readFileSync(path.join(import.meta.dirname, `../../../../messages/${locale}.json`), "utf8"),
  ) as Record<string, unknown>;
}

function contractsDurationTranslator(locale: "ar" | "en") {
  return createTranslator({
    locale,
    messages: readMessages(locale),
    namespace: "Contracts.duration",
  });
}

function baseView(partial: Partial<PublicRenewalView> = {}): PublicRenewalView {
  return {
    office: { displayName: "Diamond Rent Car" },
    contractNumber: "DE-2026-000002",
    status: "ACTIVE",
    priceType: "DAILY",
    rentalDays: 2,
    durationValue: 2,
    durationUnit: "DAY",
    agreedAmount: 600,
    currency: "AED",
    startAt: "2026-10-22T05:37:00.000Z",
    endAt: "2026-10-24T05:37:00.000Z",
    termsVersion: "v1",
    vehicle: {
      displayName: "CT-OUT-MVIXK8PJ",
      plateNumber: "CT OUT MVIXK8PJ",
      color: null,
      modelYear: null,
    },
    renewal: null,
    ...partial,
  };
}

function hourlyOffer(partial: Partial<PublicRenewalOffer> = {}): PublicRenewalOffer {
  return {
    additionalDays: 1,
    additionalDurationValue: 3,
    additionalDurationUnit: "HOUR",
    additionalAmount: 0,
    previousEndAt: "2026-10-24T05:37:00.000Z",
    newEndAt: "2026-10-24T08:37:00.000Z",
    confirmed: false,
    ...partial,
  };
}

describe("publicRenewalExtensionDuration", () => {
  it("uses structured hourly fields instead of legacy additionalDays", () => {
    const offer = hourlyOffer();
    assert.deepEqual(publicRenewalExtensionDuration(offer), {
      durationValue: 3,
      durationUnit: "HOUR",
    });

    const en = asDurationTranslator(contractsDurationTranslator("en"));
    const ar = asDurationTranslator(contractsDurationTranslator("ar"));
    const formattedEn = formatRentalDuration(publicRenewalExtensionDuration(offer), en);
    const formattedAr = formatRentalDuration(publicRenewalExtensionDuration(offer), ar);

    assert.equal(formattedEn, "3 hours");
    assert.equal(formattedAr, "3 ساعات");
    assert.notEqual(formattedEn, "1 day");
    assert.notEqual(formattedAr, "1 يوم");
  });

  it("formats daily extension from structured day fields", () => {
    const offer = hourlyOffer({
      additionalDays: 2,
      additionalDurationValue: 2,
      additionalDurationUnit: "DAY",
    });
    const en = asDurationTranslator(contractsDurationTranslator("en"));
    assert.equal(
      formatRentalDuration(publicRenewalExtensionDuration(offer), en),
      "2 days",
    );
  });

  it("falls back to additionalDays as days when structured fields are missing", () => {
    const offer = hourlyOffer({
      additionalDurationValue: undefined,
      additionalDurationUnit: undefined,
      additionalDays: 5,
    });
    assert.deepEqual(publicRenewalExtensionDuration(offer), {
      durationValue: 5,
      durationUnit: "DAY",
    });
  });
});

describe("publicRenewalCurrentDuration", () => {
  it("uses durationValue and durationUnit instead of rentalDays", () => {
    const view = baseView({
      rentalDays: 1,
      durationValue: 4,
      durationUnit: "HOUR",
    });
    assert.deepEqual(publicRenewalCurrentDuration(view), {
      durationValue: 4,
      durationUnit: "HOUR",
    });

    const en = asDurationTranslator(contractsDurationTranslator("en"));
    assert.equal(
      formatRentalDuration(publicRenewalCurrentDuration(view), en),
      "4 hours",
    );
  });
});
