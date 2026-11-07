import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TranslatedNavigationGroup } from "../navigation.types.ts";
import { filterNavigationSearch } from "./filter-navigation-search.ts";

const groups: TranslatedNavigationGroup[] = [
  {
    key: "main",
    labelKey: "home",
    label: "الرئيسية",
    items: [
      {
        key: "contracts",
        type: "link",
        labelKey: "contracts",
        href: "/contracts",
        icon: "contracts",
        label: "العقود",
      },
      {
        key: "cars",
        type: "link",
        labelKey: "cars",
        href: "/vehicles",
        icon: "cars",
        label: "السيارات",
      },
      {
        key: "future",
        type: "action",
        labelKey: "chats",
        icon: "chats",
        label: "قريباً",
      },
    ],
  },
  {
    key: "admin",
    labelKey: "admin",
    label: "الإدارة",
    items: [
      {
        key: "team",
        type: "link",
        labelKey: "team",
        href: "/team",
        icon: "team",
        label: "الموظفون",
      },
    ],
  },
];

describe("filterNavigationSearch", () => {
  it("returns empty for blank query", () => {
    assert.deepEqual(filterNavigationSearch(groups, "   "), []);
  });

  it("matches first Arabic letter against sidebar labels", () => {
    const hits = filterNavigationSearch(groups, "ع");
    assert.deepEqual(
      hits.map((h) => h.key),
      ["contracts"],
    );
  });

  it("matches partial label and attaches group label", () => {
    const hits = filterNavigationSearch(groups, "موظف");
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.key, "team");
    assert.equal(hits[0]?.groupLabel, "الإدارة");
    assert.equal(hits[0]?.href, "/team");
  });

  it("skips action items without href", () => {
    const hits = filterNavigationSearch(groups, "قريب");
    assert.equal(hits.length, 0);
  });

  it("is case-insensitive for Latin labels", () => {
    const latin: TranslatedNavigationGroup[] = [
      {
        key: "main",
        labelKey: "home",
        label: "Home",
        items: [
          {
            key: "contracts",
            type: "link",
            labelKey: "contracts",
            href: "/contracts",
            icon: "contracts",
            label: "Contracts",
          },
        ],
      },
    ];
    assert.equal(filterNavigationSearch(latin, "con")[0]?.key, "contracts");
  });
});
