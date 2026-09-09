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
