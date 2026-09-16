import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

describe("overlay stacking", () => {
  it("keeps Dialog above Drawer", () => {
    const dialogCss = readFileSync(
      path.join(import.meta.dirname, "./dialog.module.css"),
      "utf8",
    );
    const drawerCss = readFileSync(
      path.join(import.meta.dirname, "../drawer/drawer.module.css"),
      "utf8",
    );
    const dialogZ = Number(dialogCss.match(/\.scrim\s*\{[^}]*z-index:\s*(\d+)/)?.[1]);
    const drawerScrimZ = Number(drawerCss.match(/\.scrim\s*\{[^}]*z-index:\s*(\d+)/)?.[1]);
    const drawerPanelZ = Number(drawerCss.match(/\.panel\s*\{[^}]*z-index:\s*(\d+)/)?.[1]);
    assert.equal(dialogZ, 110);
    assert.equal(drawerScrimZ, 95);
    assert.equal(drawerPanelZ, 96);
    assert.ok(dialogZ > drawerPanelZ);
  });
});
