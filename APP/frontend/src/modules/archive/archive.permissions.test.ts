import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARCHIVE_MANAGE_PERMISSION,
  ARCHIVE_PAGE_PERMISSIONS,
  ARCHIVE_READ_PERMISSION,
} from "./archive.permissions.ts";

describe("archive permissions", () => {
  it("matches backend catalog keys", () => {
    assert.equal(ARCHIVE_READ_PERMISSION, "archive.read");
    assert.equal(ARCHIVE_MANAGE_PERMISSION, "archive.manage");
    assert.deepEqual(ARCHIVE_PAGE_PERMISSIONS, ["archive.read"]);
  });
});
