import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { initialLocalSaveToolbarVisible } from "../../utils/whatsapp-local-save-capability.ts";

describe("WhatsAppLocalSaveToolbar hydration", () => {
  it("keeps the toolbar hidden until after client mount", () => {
    assert.equal(initialLocalSaveToolbarVisible(), false);
  });

  it("does not call detectLocalSaveCapability during the initial render path", () => {
    const source = readFileSync(join(import.meta.dirname, "local-save-settings.tsx"), "utf8");
    const renderBody = source.split("export function WhatsAppLocalSaveToolbar")[1] ?? "";
    assert.doesNotMatch(
      renderBody.split("useEffect")[0] ?? "",
      /detectLocalSaveCapability\(\)/,
      "capability must be detected after hydration, not on first render",
    );
  });
});
