import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NavigationGroup, NavigationItem } from "../navigation.types.ts";
import { SYSTEM_ADMIN_ROLE } from "../navigation.types.ts";
import { isNavigationItemVisible } from "./navigation-visibility.ts";

const main: NavigationGroup = { key: "main", labelKey: "home", items: [] };

const CORE_NAV_ITEMS: NavigationItem[] = [
  {
    key: "contracts",
    type: "link",
    labelKey: "contracts",
    href: "/contracts",
    icon: "contracts",
    permissions: ["contracts.read"],
  },
  {
    key: "finance",
    type: "link",
    labelKey: "finance",
    href: "/finance",
    icon: "finance",
    permissions: ["finance.read"],
  },
  {
    key: "gps",
    type: "link",
    labelKey: "gps",
    href: "/gps",
    icon: "gps",
    permission: "gps.read",
  },
  {
    key: "maintenance",
    type: "link",
    labelKey: "maintenance",
    href: "/maintenance",
    icon: "maintenance",
    permissions: ["maintenance.read"],
  },
  {
    key: "violations",
    type: "link",
    labelKey: "violations",
    href: "/violations",
    icon: "violations",
    permission: "violations.read",
  },
];

function adminHasPermission(permission: string, permissions: string[], roles: string[]) {
  const isSystemAdmin = roles.includes(SYSTEM_ADMIN_ROLE);
  return isSystemAdmin || permissions.includes(permission);
}

describe("ADMIN navigation visibility", () => {
  it("system admin sees Contracts, Finance and other permission-gated core nav", () => {
    for (const item of CORE_NAV_ITEMS) {
      assert.equal(
        isNavigationItemVisible(
          item,
          main,
          (permission) => adminHasPermission(permission, [], [SYSTEM_ADMIN_ROLE]),
          true,
        ),
        true,
        `expected ${item.key} to be visible for system admin`,
      );
    }
  });

  it("restricted employee still sees only granted modules", () => {
    assert.equal(
      isNavigationItemVisible(
        CORE_NAV_ITEMS[0],
        main,
        (permission) => adminHasPermission(permission, ["vehicles.read"], ["fleet_clerk"]),
        false,
      ),
      false,
    );
    assert.equal(
      isNavigationItemVisible(
        {
          key: "cars",
          type: "link",
          labelKey: "cars",
          href: "/vehicles",
          icon: "cars",
          permissions: ["vehicles.read"],
        },
        main,
        (permission) => adminHasPermission(permission, ["vehicles.read"], ["fleet_clerk"]),
        false,
      ),
      true,
    );
  });
});
