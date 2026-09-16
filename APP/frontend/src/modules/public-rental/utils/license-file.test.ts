import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAcceptedLicenseFile } from "./license-file.ts";

describe("isAcceptedLicenseFile", () => {
  it("accepts JPEG and PNG only", () => {
    assert.equal(isAcceptedLicenseFile({ type: "image/jpeg", name: "a.jpg" } as File), true);
    assert.equal(isAcceptedLicenseFile({ type: "image/png", name: "a.png" } as File), true);
    assert.equal(
      isAcceptedLicenseFile({ type: "application/pdf", name: "a.pdf" } as File),
      false,
    );
    assert.equal(
      isAcceptedLicenseFile({ type: "image/svg+xml", name: "a.svg" } as File),
      false,
    );
  });
});
