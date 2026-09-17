import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiRequestError } from "../../../infrastructure/api/errors.ts";
import {
  publicRentalErrorReason,
  resolvePublicRentalErrorMessage,
} from "./resolve-public-rental-error.ts";
import { isLinkGoneReason } from "./flow-step.ts";
import { shouldRedirectToLogin } from "../../../infrastructure/api/session-redirect.ts";

function translator(keys: string[]) {
  const set = new Set(keys);
  return Object.assign((key: string) => key, {
    has: (key: string) => set.has(key),
  });
}

describe("resolvePublicRentalErrorMessage", () => {
  it("maps context.reason before HTTP code and never returns the raw backend message", () => {
    const t = translator([
      "error.CONTRACT_LINK_EXPIRED",
      "error.UNAUTHORIZED",
      "error.generic",
    ]);
    const message = resolvePublicRentalErrorMessage(
      t,
      new ApiRequestError(
        {
          code: "UNAUTHORIZED",
          message: "raw token expired internals",
          context: { reason: "CONTRACT_LINK_EXPIRED" },
        },
        401,
      ),
    );
    assert.equal(message, "error.CONTRACT_LINK_EXPIRED");
    assert.notEqual(message, "raw token expired internals");
  });

  it("invalid and expired public tokens render the link error, never the staff login", () => {
    const cases = [
      { code: "TOKEN_INVALID", reason: "CONTRACT_LINK_INVALID" },
      { code: "TOKEN_EXPIRED", reason: "CONTRACT_LINK_EXPIRED" },
    ];
    for (const { code, reason } of cases) {
      const withReason = new ApiRequestError({ code, message: "x", context: { reason } }, 401);
      const bare = new ApiRequestError({ code, message: "x" }, 401);
      assert.equal(publicRentalErrorReason(withReason), reason);
      assert.equal(publicRentalErrorReason(bare), reason);
      assert.equal(isLinkGoneReason(publicRentalErrorReason(bare)), true);
      assert.equal(shouldRedirectToLogin(code, { publicRequest: true }), false);
    }
  });

  it("keeps staff dead-session redirects unchanged", () => {
    assert.equal(shouldRedirectToLogin("TOKEN_EXPIRED"), true);
    assert.equal(shouldRedirectToLogin("TOKEN_INVALID"), true);
    assert.equal(shouldRedirectToLogin("UNAUTHORIZED"), true);
    assert.equal(shouldRedirectToLogin("TOKEN_EXPIRED", { publicRequest: false }), true);
    assert.equal(shouldRedirectToLogin("FORBIDDEN"), false);
    assert.equal(shouldRedirectToLogin("VALIDATION_ERROR"), false);
  });

  it("maps payment and license reasons", () => {
    const t = translator([
      "error.PAYMENT_PROVIDER_NOT_CONFIGURED",
      "error.DRIVING_LICENSE_EXPIRED",
      "error.generic",
    ]);
    assert.equal(
      resolvePublicRentalErrorMessage(
        t,
        new ApiRequestError(
          {
            code: "CONFLICT",
            message: "provider",
            context: { reason: "PAYMENT_PROVIDER_NOT_CONFIGURED" },
          },
          409,
        ),
      ),
      "error.PAYMENT_PROVIDER_NOT_CONFIGURED",
    );
    assert.equal(
      resolvePublicRentalErrorMessage(
        t,
        new ApiRequestError(
          {
            code: "CONFLICT",
            message: "expired",
            context: { reason: "DRIVING_LICENSE_EXPIRED" },
          },
          409,
        ),
      ),
      "error.DRIVING_LICENSE_EXPIRED",
    );
  });
});
