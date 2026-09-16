import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DASHBOARD_QUICK_ACCESS } from "../dashboard/utils/dashboard.routes.ts";

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(here, "../../..");

function readJson(name: "en.json" | "ar.json") {
  return JSON.parse(readFileSync(join(frontendRoot, "messages", name), "utf8")) as {
    navigation: Record<string, string>;
    Shell: Record<string, string>;
  };
}

function keysOf(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    keysOf(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("navigation config — sidebar cleanup", () => {
  const config = readFileSync(join(here, "navigation.config.ts"), "utf8");
  const icons = readFileSync(join(here, "navigation.icons.tsx"), "utf8");
  const types = readFileSync(join(here, "navigation.types.ts"), "utf8");

  it("keeps the operational rail order without Operations Center", () => {
    const keys = [...config.matchAll(/key:\s*"([^"]+)"/g)].map((match) => match[1]);
    const hrefs = [...config.matchAll(/href:\s*"([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(
      keys.filter((key) =>
        [
          "dashboard",
          "cars",
          "gps",
          "maintenance",
          "violations",
          "finance",
          "invoices",
          "contracts",
          "chats",
        ].includes(key),
      ),
      [
        "dashboard",
        "cars",
        "gps",
        "maintenance",
        "violations",
        "finance",
        "invoices",
        "contracts",
        "chats",
      ],
    );
    assert.equal(keys.includes("operations"), false);
    assert.doesNotMatch(config, /badge:\s*3/);
    assert.match(config, /href:\s*"\/whatsapp"/);
    assert.match(config, /permission:\s*"whatsapp.read"/);
    assert.doesNotMatch(config, /\/operations/);
    assert.doesNotMatch(icons, /operations:/);
    assert.doesNotMatch(types, /"operations"/);
    assert.deepEqual(
      hrefs.filter((href) =>
        [
          "/dashboard",
          "/vehicles",
          "/gps",
          "/maintenance",
          "/violations",
          "/finance",
          "/invoices",
          "/contracts",
          "/whatsapp",
        ].includes(href),
      ),
      [
        "/dashboard",
        "/vehicles",
        "/gps",
        "/maintenance",
        "/violations",
        "/finance",
        "/invoices",
        "/contracts",
        "/whatsapp",
      ],
    );
  });

  it("does not point Dashboard Quick Access at Operations Center", () => {
    assert.equal(
      DASHBOARD_QUICK_ACCESS.some((item) => item.href === "/operations"),
      false,
    );
  });
});

describe("sidebar / shell copy", () => {
  const en = readJson("en.json");
  const ar = readJson("ar.json");

  it("keeps AR and EN navigation + Shell keys aligned", () => {
    assert.deepEqual(keysOf(en.navigation).sort(), keysOf(ar.navigation).sort());
    assert.deepEqual(keysOf(en.Shell).sort(), keysOf(ar.Shell).sort());
  });

  it("displays DIAMOND without ELITE and without Operations Center copy", () => {
    assert.equal(en.Shell.brand, "DIAMOND");
    assert.equal(ar.Shell.brand, "DIAMOND");
    assert.equal(en.Shell.brandSub, "RENT CAR · DUBAI");
    assert.equal(ar.Shell.brandSub, "RENT CAR · DUBAI");
    assert.doesNotMatch(en.Shell.brand, /ELITE/i);
    assert.doesNotMatch(ar.Shell.brand, /ELITE/i);
    assert.equal("operations" in en.navigation, false);
    assert.equal("operations" in ar.navigation, false);
    assert.equal("quickAction" in en.Shell, false);
    assert.equal("quickAction" in ar.Shell, false);
    assert.equal("fleetStatLabel" in en.Shell, false);
    assert.equal("fleetStatLabel" in ar.Shell, false);
    assert.equal(en.navigation.dashboard, "Dashboard");
    assert.equal(ar.navigation.dashboard, "لوحة التحكم");
    assert.equal(en.navigation.cars, "Vehicles");
    assert.equal(ar.navigation.cars, "السيارات");
    assert.equal(en.navigation.gps, "GPS Tracking");
    assert.equal(ar.navigation.gps, "تتبع GPS");
    assert.equal(en.navigation.maintenance, "Maintenance Center");
    assert.equal(ar.navigation.maintenance, "مركز الصيانة");
    assert.equal(en.navigation.violations, "Violations & Salik");
    assert.equal(ar.navigation.violations, "المخالفات وسالك");
    assert.equal(en.navigation.finance, "Finance");
    assert.equal(ar.navigation.finance, "المالية");
    assert.equal(en.navigation.invoices, "Invoices");
    assert.equal(ar.navigation.invoices, "الفواتير");
    assert.equal(en.navigation.contracts, "Contracts");
    assert.equal(ar.navigation.contracts, "العقود");
    assert.equal(en.navigation.chats, "WhatsApp");
    assert.equal(ar.navigation.chats, "واتساب");
  });

  it("removes the New Contract shortcut and sidebar status block from the rail", () => {
    const sidebar = readFileSync(
      join(frontendRoot, "src/shared/layouts/app-shell/sidebar/sidebar.tsx"),
      "utf8",
    );
    const css = readFileSync(
      join(frontendRoot, "src/shared/layouts/app-shell/sidebar/sidebar.module.css"),
      "utf8",
    );
    assert.doesNotMatch(sidebar, /SidebarQuickAction|SidebarFleetStat|quickAction|fleetStat/);
    assert.doesNotMatch(css, /\.cta\b|\.fleetStat\b/);
  });
});
