import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FN } from "./keys.ts";
import {
  actorMayDelegateFunctionalGrantToggle,
  actorMayDelegatePermissionKeys,
} from "./delegation-guard.ts";
import type { FunctionalAuthContext } from "./types.ts";

function ctx(grants: string[], isSystemAdmin = false): FunctionalAuthContext {
  return { functionalGrants: grants, isSystemAdmin };
}

describe("actorMayDelegatePermissionKeys", () => {
  it("system admin bypasses delegation checks", () => {
    assert.equal(
      actorMayDelegatePermissionKeys(
        ctx([], true),
        [FN.finance.addExpense],
        () => false,
      ),
      true,
    );
  });

  it("cannot delegate capability the actor does not hold", () => {
    assert.equal(
      actorMayDelegatePermissionKeys(
        ctx([FN.finance.viewPage]),
        [FN.finance.addExpense],
        () => false,
      ),
      false,
    );
  });

  it("revoking non-held child can still be delegable when final set is valid", () => {
    const rolePerms = [FN.finance.viewPage];
    assert.equal(
      actorMayDelegateFunctionalGrantToggle(
        ctx([FN.finance.viewPage]),
        rolePerms,
        FN.finance.addExpense,
        true,
        () => false,
      ),
      false,
    );
    assert.equal(
      actorMayDelegateFunctionalGrantToggle(
        ctx([FN.finance.viewPage, FN.finance.addExpense]),
        [...rolePerms, FN.finance.addExpense],
        FN.finance.addExpense,
        false,
        () => false,
      ),
      true,
    );
  });
});
