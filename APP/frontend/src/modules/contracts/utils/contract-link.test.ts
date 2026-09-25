import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPublicContractUrl } from "./contract-link.ts";
import { resolveContractsListView } from "./contract-list-view.ts";
import { resolveContractsErrorMessage } from "./resolve-contracts-error.ts";
import { ApiRequestError } from "../../../infrastructure/api/errors.ts";

describe("buildPublicContractUrl", () => {
  it("builds locale rental/return/renew paths from the token", () => {
    assert.equal(
      buildPublicContractUrl("https://office.example", "ar", "RENTAL", "tok_abc"),
      "https://office.example/ar/rental/tok_abc",
    );
    assert.equal(
      buildPublicContractUrl("https://office.example/", "en", "RETURN", "tok_r"),
      "https://office.example/en/return/tok_r",
    );
    assert.equal(
      buildPublicContractUrl("https://office.example", "en", "RENEWAL", "tok_n"),
      "https://office.example/en/renew/tok_n",
    );
    assert.equal(
      buildPublicContractUrl("https://office.example", "en", "RECONCILIATION", "tok_rec"),
      "https://office.example/en/reconciliation/tok_rec",
    );
  });
});

describe("resolveContractsListView", () => {
  it("maps loading, empty, filtered empty and ready", () => {
    assert.equal(
      resolveContractsListView({
        isAllowed: true,
        isReady: false,
        itemCount: 0,
        activeFilterCount: 0,
        hasError: false,
      }),
      "loading",
    );
    assert.equal(
      resolveContractsListView({
        isAllowed: true,
        isReady: true,
        itemCount: 0,
        activeFilterCount: 0,
        hasError: false,
      }),
      "empty",
    );
    assert.equal(
      resolveContractsListView({
        isAllowed: true,
        isReady: true,
        itemCount: 0,
        activeFilterCount: 2,
        hasError: false,
      }),
      "filteredEmpty",
    );
    assert.equal(
      resolveContractsListView({
        isAllowed: true,
        isReady: true,
        itemCount: 3,
        activeFilterCount: 0,
        hasError: false,
      }),
      "ready",
    );
  });
});

describe("resolveContractsErrorMessage", () => {
  it("prefers context.reason over HTTP code", () => {
    const t = Object.assign(
      (key: string) => key,
      { has: (key: string) => key === "error.VEHICLE_ALREADY_RENTED" },
    );
    const message = resolveContractsErrorMessage(
      t,
      new ApiRequestError(
        {
          code: "CONFLICT",
          message: "Vehicle is already reserved or rented",
          context: { reason: "VEHICLE_ALREADY_RENTED" },
        },
        409,
      ),
    );
    assert.equal(message, "error.VEHICLE_ALREADY_RENTED");
  });
});
