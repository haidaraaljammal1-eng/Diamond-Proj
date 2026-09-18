import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { isDemoSimulationEnabled, isProviderSimulationEnabled, isUiDemoSimulationEnabled } from "./simulation.enabled.ts";

const read = (relative: string) => readFileSync(path.join(import.meta.dirname, relative), "utf8");

describe("external provider simulation only", () => {
  it("requires an explicit development frontend flag", () => {
    assert.equal(isProviderSimulationEnabled("true", "development"), true);
    assert.equal(isProviderSimulationEnabled("false", "development"), false);
    assert.equal(isProviderSimulationEnabled("true", "production"), false);
  });

  it("retires broad journey overlays and mutation interception", () => {
    assert.equal(isDemoSimulationEnabled("true", "development"), false);
    assert.equal(isUiDemoSimulationEnabled("roadLiabilities", "true", "development"), true);
    assert.equal(isUiDemoSimulationEnabled("roadLiabilities", "true", "production"), false);
    assert.equal(isUiDemoSimulationEnabled("finance" as "dashboard", "true", "development"), false);
    assert.equal(read("../public-rental/stores/public-rental.store.ts").includes("shouldSkipRentalMutation"), false);
  });

  it("shows only license, passport, and payment provider actions in the rental UI", () => {
    const screen = read("../public-rental/components/public-rental-screen/public-rental-screen.tsx");
    const payment = read("../public-rental/components/payment-step/payment-step.tsx");
    const review = read("../public-rental/components/contract-review-step/contract-review-step.tsx");
    const carOut = read("../contracts/forms/car-out/car-out-dialog.tsx");
    assert.equal((screen.match(/<SimulationAction/g) ?? []).length, 2);
    assert.equal((payment.match(/<SimulationAction/g) ?? []).length, 1);
    assert.equal(review.includes("SimulationAction"), false);
    assert.equal(carOut.includes("SimulationAction"), false);
    assert.equal(read("../../app/[locale]/layout.tsx").includes("SimulationChrome"), false);
  });

  it("requires backend capability before showing a provider action", () => {
    const screen = read("../public-rental/components/public-rental-screen/public-rental-screen.tsx");
    assert.ok(screen.includes("providerSimulationEnabled && context.payment.devSimulationAvailable"));
    assert.ok(!screen.includes("useDemoSimulation"));
  });
});
