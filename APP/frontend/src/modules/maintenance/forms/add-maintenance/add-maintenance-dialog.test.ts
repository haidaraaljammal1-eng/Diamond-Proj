import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "../../../..");

function readSource(relativePath: string): string {
  return readFileSync(join(srcRoot, relativePath), "utf8");
}

describe("AddMaintenanceDialog nested form", () => {
  const dialog = readSource(
    "modules/maintenance/forms/add-maintenance/add-maintenance-dialog.tsx",
  );
  const picker = readSource(
    "modules/maintenance/components/maintenance-vehicle-picker/maintenance-vehicle-picker.tsx",
  );
  const fleetSearch = readSource(
    "modules/vehicles/components/vehicle-filters/vehicle-filters.tsx",
  );
  const maintenanceFilters = readSource(
    "modules/maintenance/components/maintenance-filters/maintenance-filters.tsx",
  );

  it("keeps the Add Maintenance <form> and opts the vehicle DataSearch into embedded mode", () => {
    assert.match(dialog, /<form[\s\S]*className=\{styles\.form\}/);
    assert.match(dialog, /type="submit"/);
    assert.match(dialog, /embeddedSearch/);
    assert.match(picker, /embedded=\{embeddedSearch\}/);
    assert.doesNotMatch(picker, /<form/);
  });

  it("does not enable embedded DataSearch on Fleet or Maintenance list search", () => {
    assert.match(fleetSearch, /<DataSearch/);
    assert.doesNotMatch(fleetSearch, /embedded/);
    assert.match(maintenanceFilters, /<DataSearch/);
    assert.doesNotMatch(maintenanceFilters, /embedded/);
  });
});
