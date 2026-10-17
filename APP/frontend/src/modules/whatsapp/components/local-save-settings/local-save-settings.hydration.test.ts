import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { initialLocalSaveToolbarVisible } from "../../utils/whatsapp-local-save-capability.ts";

describe("WhatsAppLocalSaveToolbar hydration", () => {
  it("keeps the toolbar hidden until after client mount", () => {
    assert.equal(initialLocalSaveToolbarVisible(), false);
  });

  it("restores save-path label from persisted folder state after mount", () => {
    const source = readFileSync(join(import.meta.dirname, "local-save-settings.tsx"), "utf8");
    assert.match(source, /useState\(initialLocalSaveToolbarVisible\)/);
    assert.match(source, /localSaveStatus/);
    assert.match(source, /subscribeLocalSave/);
    assert.match(source, /pathReady/);
    const capabilityEffect = source.split("useEffect(() => {")[1]?.split("}, [])")[0] ?? "";
    assert.match(capabilityEffect, /detectLocalSaveCapability\(\)/);
  });
});
