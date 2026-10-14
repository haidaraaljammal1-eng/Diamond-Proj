import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { globSync } from "glob";
import path from "node:path";
import {
  DIAMOND_V2_MODULE_PREFIXES,
  isDiamondStaffRouteUrl,
  isDiamondV2MappedOperation,
  V2_SYSTEM_ADMIN_ONLY_OPERATION_IDS,
} from "src/lib/rbac/functional-permissions/route-coverage";
import { ROUTE_FUNCTIONAL_REQUIREMENTS } from "src/lib/rbac/functional-permissions/route-requirements";

const backendRoot = path.join(__dirname, "..", "..");

function diamondRouteFiles(): string[] {
  const files: string[] = [];
  for (const prefix of DIAMOND_V2_MODULE_PREFIXES) {
    const pattern = path
      .join(backendRoot, "src", "modules", prefix, "**", "route.ts")
      .replace(/\\/g, "/");
    files.push(...globSync(pattern));
  }
  return [...new Set(files)];
}

describe("Diamond RBAC V2 route coverage", () => {
  test("staff URL detector covers page prefixes", () => {
    assert.ok(isDiamondStaffRouteUrl("/vehicles"));
    assert.ok(isDiamondStaffRouteUrl("/contracts/abc/car-out"));
    assert.ok(!isDiamondStaffRouteUrl("/rental/token"));
    assert.ok(!isDiamondStaffRouteUrl("/auth/login"));
  });

  test("functional operation map size", () => {
    const count = Object.keys(ROUTE_FUNCTIONAL_REQUIREMENTS).length;
    assert.ok(count >= 140, `expected >= 140 mapped operations, got ${count}`);
  });

  test("Diamond staff route files declare V2 mappings for permission-gated operations", () => {
    const unmapped: { file: string; operationId: string }[] = [];
    for (const file of diamondRouteFiles()) {
      const content = readFileSync(file, "utf8");
      if (!content.includes("permissions:")) continue;
      const blocks = content.split(/operationId:\s*"/);
      for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];
        if (!block) continue;
        const operationId = block.split('"')[0];
        if (!operationId) continue;
        const window = block.slice(0, 800);
        if (!window.includes("permissions:")) continue;
        if (V2_SYSTEM_ADMIN_ONLY_OPERATION_IDS.has(operationId)) {
          continue;
        }
        if (!isDiamondV2MappedOperation(operationId)) {
          unmapped.push({ file: path.relative(backendRoot, file), operationId });
        }
      }
    }
    assert.equal(
      unmapped.length,
      0,
      `Unmapped operations:\n${unmapped.map((u) => `${u.operationId} in ${u.file}`).join("\n")}`,
    );
  });
});
