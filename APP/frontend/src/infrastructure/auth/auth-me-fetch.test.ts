import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AuthUser } from "./auth.types.ts";
import { selectAuthMeFetcher } from "./auth-me-fetch.ts";
import { createRefreshCoordinator } from "./refresh-coordinator.ts";
import {
  applyAuthUserToToken,
  syncJwtPermissionsFromAuthMe,
} from "./session-permissions.ts";

function user(perms: string[]): AuthUser {
  return {
    id: 1,
    email: "u@test",
    name: "U",
    roles: [{ id: 2, key: "r1", name: "R1" }],
    permissions: perms,
  };
}

describe("selectAuthMeFetcher", () => {
  it("routes explicit update to fresh fetch", async () => {
    let freshCalls = 0;
    let coordinatedCalls = 0;
    const fresh = async () => {
      freshCalls += 1;
      return user(["a"]);
    };
    const coordinated = async () => {
      coordinatedCalls += 1;
      return user(["b"]);
    };
    const pick = selectAuthMeFetcher("update", fresh, coordinated);
    await pick("at");
    assert.equal(freshCalls, 1);
    assert.equal(coordinatedCalls, 0);
  });

  it("routes ordinary jwt ticks to coordinated fetch", async () => {
    let freshCalls = 0;
    let coordinatedCalls = 0;
    const fresh = async () => {
      freshCalls += 1;
      return user(["a"]);
    };
    const coordinated = async () => {
      coordinatedCalls += 1;
      return user(["b"]);
    };
    const pick = selectAuthMeFetcher(undefined, fresh, coordinated);
    await pick("at");
    assert.equal(freshCalls, 0);
    assert.equal(coordinatedCalls, 1);
  });
});

describe("live permission snapshot via update fetcher", () => {
  it("explicit update observes newest /auth/me grant and revoke", async () => {
    let generation = 0;
    const fresh = async () => {
      generation += 1;
      return user(
        generation === 1
          ? ["diamond.fn.roles.create_edit"]
          : ["diamond.fn.roles.view_page"],
      );
    };
    const coordinated = createRefreshCoordinator(fresh, {
      ttlMs: 60_000,
      now: () => 1_000,
    });

    const token = { accessToken: "at-1", permissions: [] as string[] };
    const afterGrant = await syncJwtPermissionsFromAuthMe(
      token,
      selectAuthMeFetcher("update", fresh, coordinated),
      2_000,
    );
    assert.equal(
      afterGrant.permissions?.includes("diamond.fn.roles.create_edit"),
      true,
    );

    const afterRevoke = await syncJwtPermissionsFromAuthMe(
      afterGrant,
      selectAuthMeFetcher("update", fresh, coordinated),
      2_100,
    );
    assert.equal(
      afterRevoke.permissions?.includes("diamond.fn.roles.create_edit"),
      false,
    );
    assert.equal(
      afterRevoke.permissions?.includes("diamond.fn.roles.view_page"),
      true,
    );
  });

  it("coordinated fetch dedupes within TTL (anti-stampede)", async () => {
    let calls = 0;
    const fresh = async () => {
      calls += 1;
      return user(["x"]);
    };
    const coordinated = createRefreshCoordinator(fresh, {
      ttlMs: 5_000,
      now: () => 5_000,
    });
    await coordinated("same-token");
    await coordinated("same-token");
    assert.equal(calls, 1);
  });

  it("applyAuthUserToToken replaces snapshot (no merge)", () => {
    const next = applyAuthUserToToken(
      { accessToken: "t", permissions: ["old"] },
      user(["new"]),
      1,
    );
    assert.deepEqual(next.permissions, ["new"]);
  });
});
