import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { showLicenseStatusCardFacts } from "./license-status-card-facts.ts";

describe("showLicenseStatusCardFacts", () => {
  it("shows facts for VALID and EXPIRED when number and expiry are present", () => {
    assert.equal(showLicenseStatusCardFacts("VALID", "1893918", "13/04/2023"), true);
    assert.equal(showLicenseStatusCardFacts("EXPIRED", "1893918", "13/04/2023"), true);
  });

  it("hides facts for UNREADABLE and other statuses", () => {
    assert.equal(showLicenseStatusCardFacts("UNREADABLE", "1893918", "13/04/2023"), false);
    assert.equal(showLicenseStatusCardFacts("REVIEW_REQUIRED", "1", "01/01/2020"), false);
    assert.equal(showLicenseStatusCardFacts("PROVIDER_UNAVAILABLE", "1", "01/01/2020"), false);
    assert.equal(showLicenseStatusCardFacts(null, "1", "01/01/2020"), false);
  });

  it("hides facts when number or expiry is missing (no placeholder rows)", () => {
    assert.equal(showLicenseStatusCardFacts("EXPIRED", null, "13/04/2023"), false);
    assert.equal(showLicenseStatusCardFacts("EXPIRED", "1893918", null), false);
    assert.equal(showLicenseStatusCardFacts("EXPIRED", "  ", "13/04/2023"), false);
    assert.equal(showLicenseStatusCardFacts("VALID", "1893918", ""), false);
  });
});
