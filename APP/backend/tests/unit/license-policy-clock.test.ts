import assert from "node:assert/strict";
import { test } from "node:test";
import {
  E2E_LICENSE_POLICY_DATE_HEADER,
  resolveLicensePolicyNow,
} from "src/modules/contracts/license-policy-clock";
import { calendarDateToStoredUtc } from "src/modules/contracts/license-calendar";

test("resolveLicensePolicyNow ignores header when env gate is off", () => {
  const previous = process.env.E2E_ALLOW_LICENSE_POLICY_CLOCK;
  process.env.E2E_ALLOW_LICENSE_POLICY_CLOCK = "false";
  const fallback = new Date("2026-01-15T12:00:00.000Z");
  const resolved = resolveLicensePolicyNow(
    { headers: { [E2E_LICENSE_POLICY_DATE_HEADER]: "2023-01-01" } },
    fallback,
  );
  assert.equal(resolved.getTime(), fallback.getTime());
  if (previous === undefined) delete process.env.E2E_ALLOW_LICENSE_POLICY_CLOCK;
  else process.env.E2E_ALLOW_LICENSE_POLICY_CLOCK = previous;
});

test("resolveLicensePolicyNow parses guarded header when gate is on", () => {
  const previous = process.env.E2E_ALLOW_LICENSE_POLICY_CLOCK;
  process.env.E2E_ALLOW_LICENSE_POLICY_CLOCK = "true";
  const resolved = resolveLicensePolicyNow(
    { headers: { [E2E_LICENSE_POLICY_DATE_HEADER]: "2023-01-01" } },
    new Date("2026-01-01T12:00:00.000Z"),
  );
  assert.equal(
    resolved.getTime(),
    calendarDateToStoredUtc({ y: 2023, m: 1, d: 1 }).getTime(),
  );
  if (previous === undefined) delete process.env.E2E_ALLOW_LICENSE_POLICY_CLOCK;
  else process.env.E2E_ALLOW_LICENSE_POLICY_CLOCK = previous;
});
