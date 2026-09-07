import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { BUTTON_VARIANTS } from "./button.types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function readSource(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("Shared Button variants", () => {
  it("exposes primary, secondary, and secondaryStrong in the public variant list", () => {
    assert.ok(BUTTON_VARIANTS.includes("primary"));
    assert.ok(BUTTON_VARIANTS.includes("secondary"));
    assert.ok(BUTTON_VARIANTS.includes("secondaryStrong"));
  });

  it("styles secondary with gold text on an ivory surface", () => {
    const css = readSource("shared/components/ui/button/button.module.css");
    assert.match(css, /\.secondary\s*\{[\s\S]*color:\s*var\(--diamond-gold-hi\)/);
    assert.match(css, /\.secondary\s*\{[\s\S]*background:\s*rgba\(201,\s*161,\s*92,\s*0\.09\)/);
  });

  it("styles secondaryStrong with champagne ivory fill and dark gold text", () => {
    const css = readSource("shared/components/ui/button/button.module.css");
    assert.match(css, /\.secondaryStrong\s*\{[\s\S]*color:\s*var\(--diamond-gold-hi\)/);
    assert.match(css, /\.secondaryStrong\s*\{[\s\S]*background:\s*linear-gradient\(180deg,\s*#fffdf8,\s*#f4e6c8\)/);
    assert.match(css, /\.secondaryStrong\s*\{[\s\S]*box-shadow:\s*0 2px 8px rgba\(122,\s*96,\s*48,\s*0\.14\)/);
    assert.match(css, /\.secondaryStrong\s*\{[\s\S]*border:\s*1\.5px solid rgba\(201,\s*161,\s*92,\s*0\.55\)/);
  });

  it("styles primary with the dark gold gradient fill", () => {
    const css = readSource("shared/components/ui/button/button.module.css");
    assert.match(css, /\.primary\s*\{[\s\S]*background:\s*var\(--diamond-gold-gradient\)/);
  });
});

describe("Vehicles button hierarchy", () => {
  it("uses primary for Add Vehicle and secondary for toolbar utilities", () => {
    const screen = readSource("modules/vehicles/components/vehicles-screen/vehicles-screen.tsx");
    assert.match(screen, /variant="primary"[\s\S]*addVehicle/);
    assert.match(screen, /variant="secondary"[\s\S]*refresh/);
  });

  it("uses secondary for DataSearch submit", () => {
    const dataSearch = readSource("shared/components/data-search/data-search.tsx");
    assert.match(dataSearch, /variant="secondary"/);
    assert.doesNotMatch(dataSearch, /variant="ghost"/);
  });

  it("uses secondary for clear filters and card icon actions", () => {
    const filters = readSource("modules/vehicles/components/vehicle-filters/vehicle-filters.tsx");
    const card = readSource("modules/vehicles/components/vehicle-card/vehicle-card.tsx");

    assert.match(filters, /<Button[^>]*variant="secondary"/);
    assert.doesNotMatch(filters, /<Button[^>]*variant="ghost"/);
    assert.equal((card.match(/variant="secondary"/g) ?? []).length, 3);
    assert.match(card, /variant="primary"[\s\S]*primaryAction/);
  });

  it("uses secondaryStrong for Vehicle Detail photo actions", () => {
    const detail = readSource(
      "modules/vehicles/components/vehicle-detail/vehicle-detail.tsx",
    );
    assert.equal((detail.match(/variant="secondaryStrong"/g) ?? []).length, 2);
    assert.match(detail, /iconName="mdi:image-edit-outline"/);
    assert.doesNotMatch(detail, /variant="primary"[\s\S]*replacePhoto/);
  });
});
