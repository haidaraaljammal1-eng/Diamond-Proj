import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  shouldRefetchInBackground,
  type RolesLoadStatus,
} from "./roles-permissions.refetch-policy.ts";

describe("roles permissions matrix scroll regression", () => {
  it("background refetch only when catalog is already ready", () => {
    const cases: Array<{ status: RolesLoadStatus; background: boolean }> = [
      { status: "idle", background: false },
      { status: "loading", background: false },
      { status: "ready", background: true },
      { status: "error", background: false },
    ];
    for (const { status, background } of cases) {
      assert.equal(
        shouldRefetchInBackground(status),
        background,
        `status ${status}`,
      );
    }
  });
});
