import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  MATRIX_HIDDEN_LEGACY_PERMISSION_KEYS,
  filterPermissionsForMatrixDisplay,
  isMatrixPermissionRowVisible,
} from "./roles-display-permissions.ts";

describe("roles-display-permissions", () => {
  test("legacy hidden list has 55 unique keys", () => {
    assert.equal(MATRIX_HIDDEN_LEGACY_PERMISSION_KEYS.length, 55);
    assert.equal(
      new Set(MATRIX_HIDDEN_LEGACY_PERMISSION_KEYS).size,
      55,
    );
  });

  test("filter keeps diamond product keys visible", () => {
    const catalog = [
      { id: 1, key: "contracts.read" },
      { id: 2, key: "complaints.read" },
      { id: 3, key: "dashboard.read" },
    ];
    const filtered = filterPermissionsForMatrixDisplay(catalog);
    assert.equal(filtered.length, 2);
    assert.equal(isMatrixPermissionRowVisible("contracts.read"), true);
    assert.equal(isMatrixPermissionRowVisible("complaints.read"), false);
  });
});
