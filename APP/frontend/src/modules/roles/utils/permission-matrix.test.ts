import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPermissionMatrix,
  filterPermissionMatrix,
  resolvePermissionAction,
  resolvePermissionGroup,
} from "./permission-matrix.ts";
import type { PermissionDto } from "../types/permission.types.ts";
import type { RoleDto } from "../types/role.types.ts";

/**
 * Fixtures only — never production data. Real roles and permissions always come
 * from the Backend.
 */
function role(overrides: Partial<RoleDto> & Pick<RoleDto, "id" | "key">): RoleDto {
  return {
    name: overrides.key,
    description: null,
    isSystem: false,
    permissions: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function permission(
  id: number,
  key: string,
  category: string | null = null,
): PermissionDto {
  return { id, key, category, description: null };
}

const roleA = role({
  id: 1,
  key: "role_a",
  name: "Role A",
  isSystem: true,
  permissions: ["alpha.one", "alpha.two", "beta.one"],
});
const roleB = role({
  id: 2,
  key: "role_b",
  name: "Role B",
  permissions: ["alpha.one"],
});

const catalog = [
  permission(10, "alpha.one", "alpha"),
  permission(11, "alpha.two", "alpha"),
  permission(12, "beta.one", "beta"),
  // Held by no role — it must still appear as a row.
  permission(13, "beta.orphan", "beta"),
];

const identityLabel = (item: PermissionDto) => item.key;

describe("resolvePermissionGroup", () => {
  it("prefers the Backend category", () => {
    assert.equal(resolvePermissionGroup(permission(1, "alpha.one", "custom")), "custom");
  });

  it("falls back to the key namespace when there is no category", () => {
    assert.equal(resolvePermissionGroup(permission(1, "alpha.one")), "alpha");
  });
});

describe("resolvePermissionAction", () => {
  it("returns the action segment", () => {
    assert.equal(resolvePermissionAction("alpha.one"), "one");
  });

  it("returns an empty string for a key without an action", () => {
    assert.equal(resolvePermissionAction("alpha"), "");
  });

  it("returns the last segment of a compound key", () => {
    assert.equal(resolvePermissionAction("alpha.beta.one"), "one");
  });
});

describe("buildPermissionMatrix", () => {
  const matrix = buildPermissionMatrix([roleA, roleB], catalog);

  it("keeps every role as a column, in Backend order", () => {
    assert.deepEqual(
      matrix.roles.map((item) => item.key),
      ["role_a", "role_b"],
    );
  });

  it("keeps every catalog permission as a row, grouped", () => {
    assert.deepEqual(
      matrix.groups.map((group) => group.key),
      ["alpha", "beta"],
    );
    assert.deepEqual(
      matrix.groups.flatMap((group) => group.permissions.map((item) => item.key)),
      ["alpha.one", "alpha.two", "beta.one", "beta.orphan"],
    );
    assert.equal(matrix.permissionCount, 4);
  });

  it("marks a granted permission as allowed", () => {
    assert.equal(matrix.hasPermission(roleA.id, "alpha.two"), true);
  });

  it("marks a permission the role does not hold as not allowed", () => {
    assert.equal(matrix.hasPermission(roleB.id, "alpha.two"), false);
  });

  it("keeps a permission no role holds visible and empty in every column", () => {
    const beta = matrix.groups.find((group) => group.key === "beta");
    assert.ok(beta?.permissions.some((item) => item.key === "beta.orphan"));
    assert.equal(matrix.hasPermission(roleA.id, "beta.orphan"), false);
    assert.equal(matrix.hasPermission(roleB.id, "beta.orphan"), false);
  });

  it("reports an unknown role as holding nothing", () => {
    assert.equal(matrix.hasPermission(999, "alpha.one"), false);
    assert.equal(matrix.permissionCountFor(999), 0);
  });

  it("counts the permissions a role holds", () => {
    assert.equal(matrix.permissionCountFor(roleA.id), 3);
    assert.equal(matrix.permissionCountFor(roleB.id), 1);
  });

  it("preserves the Backend `isSystem` flag", () => {
    assert.equal(matrix.roles[0]?.isSystem, true);
    assert.equal(matrix.roles[1]?.isSystem, false);
  });
});

describe("filterPermissionMatrix", () => {
  const matrix = buildPermissionMatrix([roleA, roleB], catalog);

  it("returns everything when no filter is applied", () => {
    const result = filterPermissionMatrix(matrix, {
      search: "",
      group: null,
      labelOf: identityLabel,
    });
    assert.equal(result.permissionCount, 4);
    assert.equal(result.groups.length, 2);
  });

  it("matches the technical key", () => {
    const result = filterPermissionMatrix(matrix, {
      search: "orphan",
      group: null,
      labelOf: identityLabel,
    });
    assert.deepEqual(
      result.groups.flatMap((group) => group.permissions.map((item) => item.key)),
      ["beta.orphan"],
    );
  });

  it("matches the resolved label", () => {
    const result = filterPermissionMatrix(matrix, {
      search: "second",
      group: null,
      labelOf: (item) => (item.key === "alpha.two" ? "Second alpha" : item.key),
    });
    assert.deepEqual(
      result.groups.flatMap((group) => group.permissions.map((item) => item.key)),
      ["alpha.two"],
    );
  });

  it("is case insensitive", () => {
    const result = filterPermissionMatrix(matrix, {
      search: "ALPHA.ONE",
      group: null,
      labelOf: identityLabel,
    });
    assert.equal(result.permissionCount, 1);
  });

  it("keeps only the selected group", () => {
    const result = filterPermissionMatrix(matrix, {
      search: "",
      group: "beta",
      labelOf: identityLabel,
    });
    assert.deepEqual(
      result.groups.map((group) => group.key),
      ["beta"],
    );
    assert.equal(result.permissionCount, 2);
  });

  it("never leaves a group header without matching rows", () => {
    const result = filterPermissionMatrix(matrix, {
      search: "alpha",
      group: null,
      labelOf: identityLabel,
    });
    assert.deepEqual(
      result.groups.map((group) => group.key),
      ["alpha"],
    );
    assert.ok(result.groups.every((group) => group.permissions.length > 0));
  });

  it("keeps the role columns and lookups intact while filtering", () => {
    const result = filterPermissionMatrix(matrix, {
      search: "alpha",
      group: null,
      labelOf: identityLabel,
    });
    assert.equal(result.roles.length, 2);
    assert.equal(result.hasPermission(roleA.id, "alpha.one"), true);
    assert.equal(result.permissionCountFor(roleA.id), 3);
  });

  it("returns no group when nothing matches", () => {
    const result = filterPermissionMatrix(matrix, {
      search: "no-such-permission",
      group: null,
      labelOf: identityLabel,
    });
    assert.deepEqual(result.groups, []);
    assert.equal(result.permissionCount, 0);
  });
});
