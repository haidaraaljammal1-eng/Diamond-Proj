import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AuthUser } from "./auth.types.ts";
import {
  applyAuthUserToToken,
  PERMISSIONS_SYNC_TTL_MS,
  SESSION_LIVE_VERIFY_TTL_MS,
  shouldSyncPermissionsFromAuthMe,
  shouldVerifyBackendSessionLive,
  syncJwtPermissionsFromAuthMe,
  type SessionPermissionToken,
} from "./session-permissions.ts";

function authUser(permissions: string[]): AuthUser {
  return {
    id: 7,
    email: "admin@diamond.test",
    name: "Dev Admin",
    roles: [{ id: 1, key: "system_admin", name: "System Admin" }],
    permissions,
  };
}

describe("shouldSyncPermissionsFromAuthMe", () => {
  const token: SessionPermissionToken = {
    accessToken: "at-1",
    permissions: [],
  };

  it("rehydrates existing sessions that have never synced", () => {
    assert.equal(shouldSyncPermissionsFromAuthMe(token, 1_000), true);
  });

  it("does not call /auth/me on every jwt tick while the snapshot is fresh", () => {
    assert.equal(
      shouldSyncPermissionsFromAuthMe(
        { ...token, permissionsSyncedAt: 1_000 },
        1_000 + 60_000,
      ),
      false,
    );
  });

  it("rehydrates when the permission snapshot is older than the TTL", () => {
    assert.equal(
      shouldSyncPermissionsFromAuthMe(
        { ...token, permissionsSyncedAt: 1_000 },
        1_000 + PERMISSIONS_SYNC_TTL_MS,
      ),
      true,
    );
  });

  it("rehydrates on explicit session update even when the snapshot is fresh", () => {
    assert.equal(
      shouldSyncPermissionsFromAuthMe(
        { ...token, permissionsSyncedAt: 1_000 },
        1_001,
        "update",
      ),
      true,
    );
  });

  it("does not rehydrate without an access token or after a failed refresh", () => {
    assert.equal(shouldSyncPermissionsFromAuthMe({}, 1_000), false);
    assert.equal(
      shouldSyncPermissionsFromAuthMe(
        { ...token, error: "RefreshAccessTokenError" },
        1_000,
        "update",
      ),
      false,
    );
  });
});

describe("shouldVerifyBackendSessionLive", () => {
  const token: SessionPermissionToken = {
    accessToken: "at-1",
    backendSessionVerifiedAt: 1_000,
  };

  it("requires verification when never confirmed with /auth/me", () => {
    assert.equal(
      shouldVerifyBackendSessionLive({ accessToken: "at-1" }, 2_000),
      true,
    );
  });

  it("skips verification inside the live TTL window", () => {
    assert.equal(
      shouldVerifyBackendSessionLive(
        token,
        1_000 + SESSION_LIVE_VERIFY_TTL_MS - 1,
      ),
      false,
    );
  });

  it("re-verifies after the live TTL window", () => {
    assert.equal(
      shouldVerifyBackendSessionLive(token, 1_000 + SESSION_LIVE_VERIFY_TTL_MS),
      true,
    );
  });
});

describe("applyAuthUserToToken", () => {
  it("adds contracts.read when /auth/me starts returning it", () => {
    const previous: SessionPermissionToken = {
      accessToken: "at-1",
      permissions: ["dashboard.read"],
    };
    const next = applyAuthUserToToken(
      previous,
      authUser(["dashboard.read", "contracts.read"]),
      50,
    );
    assert.equal(next.permissions?.includes("contracts.read"), true);
    assert.deepEqual(next.roles, ["system_admin"]);
    assert.equal(next.userId, "7");
    assert.equal(next.permissionsSyncedAt, 50);
  });

  it("drops contracts.read when /auth/me no longer returns it", () => {
    const previous: SessionPermissionToken = {
      accessToken: "at-1",
      permissions: ["dashboard.read", "contracts.read"],
    };
    const next = applyAuthUserToToken(
      previous,
      authUser(["dashboard.read"]),
      90,
    );
    assert.equal(next.permissions?.includes("contracts.read"), false);
    assert.deepEqual(next.permissions, ["dashboard.read"]);
  });
});

describe("syncJwtPermissionsFromAuthMe", () => {
  it("replaces the session snapshot from GET /auth/me", async () => {
    const previous: SessionPermissionToken = {
      accessToken: "at-1",
      permissions: [],
    };
    const next = await syncJwtPermissionsFromAuthMe(
      previous,
      async (accessToken) => {
        assert.equal(accessToken, "at-1");
        return authUser(["contracts.read"]);
      },
      10,
    );
    assert.equal(next.permissions?.includes("contracts.read"), true);
  });

  it("keeps the previous snapshot when /auth/me fails, without looping", async () => {
    let calls = 0;
    const previous: SessionPermissionToken = {
      accessToken: "at-1",
      permissions: ["dashboard.read"],
    };
    const next = await syncJwtPermissionsFromAuthMe(
      previous,
      async () => {
        calls += 1;
        throw new Error("AUTH_ME_UNAVAILABLE");
      },
      20,
    );
    assert.equal(calls, 1);
    assert.deepEqual(next.permissions, ["dashboard.read"]);
    assert.equal(next.permissionsSyncedAt, 20);
    assert.equal(
      shouldSyncPermissionsFromAuthMe(next, 20 + 1_000),
      false,
    );
  });

  it("marks the JWT dead when /auth/me returns TOKEN_INVALID", async () => {
    const previous: SessionPermissionToken = {
      accessToken: "at-revoked",
      refreshToken: "rt-revoked",
      permissions: ["dashboard.read"],
    };
    const next = await syncJwtPermissionsFromAuthMe(
      previous,
      async () => {
        throw new Error("TOKEN_INVALID");
      },
      30,
    );
    assert.equal(next.error, "RefreshAccessTokenError");
    assert.equal(next.accessToken, undefined);
    assert.equal(next.refreshToken, undefined);
    assert.equal(shouldSyncPermissionsFromAuthMe(next, 31), false);
  });
});
