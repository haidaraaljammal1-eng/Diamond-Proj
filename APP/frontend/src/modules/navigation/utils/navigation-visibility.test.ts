import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NavigationGroup, NavigationItem } from "../navigation.types.ts";
import { isNavigationItemVisible } from "./navigation-visibility.ts";

const main: NavigationGroup = { key: "main", labelKey: "home", items: [] };

const contracts: NavigationItem = {
  key: "contracts",
  type: "link",
  labelKey: "contracts",
  href: "/contracts",
  icon: "contracts",
  permissions: ["contracts.read"],
};

describe("isNavigationItemVisible", () => {
  it("shows Contracts when the session holds contracts.read", () => {
    assert.equal(
      isNavigationItemVisible(
        contracts,
        main,
        (permission) => permission === "contracts.read",
        false,
      ),
      true,
    );
  });

  it("hides Contracts when the session does not hold contracts.read", () => {
    assert.equal(
      isNavigationItemVisible(contracts, main, () => false, false),
      false,
    );
  });

  it("does not treat system_admin as a Contracts bypass", () => {
    assert.equal(
      isNavigationItemVisible(contracts, main, () => false, true),
      false,
    );
  });
});

const maintenance: NavigationItem = {
  key: "maintenance",
  type: "link",
  labelKey: "maintenance",
  href: "/maintenance",
  icon: "maintenance",
  permissions: ["maintenance.read"],
};

describe("maintenance navigation visibility", () => {
  it("shows Maintenance when the session holds maintenance.read", () => {
    assert.equal(
      isNavigationItemVisible(
        maintenance,
        main,
        (permission) => permission === "maintenance.read",
        false,
      ),
      true,
    );
  });

  it("hides Maintenance when the session does not hold maintenance.read", () => {
    assert.equal(
      isNavigationItemVisible(maintenance, main, () => false, false),
      false,
    );
  });

  it("does not treat system_admin as a Maintenance bypass", () => {
    assert.equal(
      isNavigationItemVisible(maintenance, main, () => false, true),
      false,
    );
  });
});

const gps: NavigationItem = {
  key: "gps",
  type: "link",
  labelKey: "gps",
  href: "/gps",
  icon: "gps",
  permission: "gps.read",
};

describe("gps navigation visibility", () => {
  it("shows GPS when the session holds gps.read", () => {
    assert.equal(
      isNavigationItemVisible(
        gps,
        main,
        (permission) => permission === "gps.read",
        false,
      ),
      true,
    );
  });

  it("hides GPS when the session does not hold gps.read", () => {
    assert.equal(
      isNavigationItemVisible(gps, main, () => false, false),
      false,
    );
  });

  it("does not treat system_admin as a GPS bypass", () => {
    assert.equal(
      isNavigationItemVisible(gps, main, () => false, true),
      false,
    );
  });
});

const violations: NavigationItem = {
  key: "violations",
  type: "link",
  labelKey: "violations",
  href: "/violations",
  icon: "violations",
  permission: "violations.read",
};

describe("violations navigation visibility", () => {
  it("shows Violations & Salik when the session holds violations.read", () => {
    assert.equal(
      isNavigationItemVisible(
        violations,
        main,
        (permission) => permission === "violations.read",
        false,
      ),
      true,
    );
  });

  it("hides Violations & Salik when the session does not hold violations.read", () => {
    assert.equal(
      isNavigationItemVisible(violations, main, () => false, false),
      false,
    );
  });

  it("does not treat system_admin as a Violations bypass", () => {
    assert.equal(
      isNavigationItemVisible(violations, main, () => false, true),
      false,
    );
  });
});

const chats: NavigationItem = {
  key: "chats",
  type: "link",
  labelKey: "chats",
  href: "/whatsapp",
  icon: "chats",
  permission: "whatsapp.read",
};

describe("whatsapp navigation visibility", () => {
  it("shows WhatsApp when the session holds whatsapp.read", () => {
    assert.equal(
      isNavigationItemVisible(
        chats,
        main,
        (permission) => permission === "whatsapp.read",
        false,
      ),
      true,
    );
  });

  it("hides WhatsApp when the session does not hold whatsapp.read", () => {
    assert.equal(isNavigationItemVisible(chats, main, () => false, false), false);
  });

  it("does not treat system_admin as a WhatsApp bypass", () => {
    assert.equal(isNavigationItemVisible(chats, main, () => false, true), false);
  });
});
