import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  DEFAULT_ROAD_LIABILITIES_QUERY,
  buildRoadLiabilitiesQuery,
  filterSimulatedLiabilities,
} from "./road-liability-filters.ts";
import type {
  RoadLiabilitiesListQuery,
  RoadLiabilityListItemDto,
} from "../types/road-liabilities.types.ts";

/**
 * Road-liability company identity is resolved by the Backend (attributed Contract
 * first, then the Vehicle) and only displayed here. The frontend never reproduces
 * that precedence, never guesses a company for an unmatched liability, and never
 * hardcodes UNIQUE / ELITE.
 */

const MODULE_DIR = path.join(import.meta.dirname, "..");
const MESSAGES_DIR = path.join(import.meta.dirname, "../../../../messages");

function read(relative: string): string {
  return readFileSync(path.join(MODULE_DIR, relative), "utf8");
}

const UNIQUE = { id: 1, code: "UNIQUE", displayName: "UNIQUE", accentColor: "#C9A15C" };
const ELITE = { id: 2, code: "ELITE", displayName: "ELITE", accentColor: "#3E5C76" };

function item(
  id: string,
  company: RoadLiabilityListItemDto["company"],
): RoadLiabilityListItemDto {
  return {
    id,
    type: "rta_violation",
    source: "RTA",
    occurredAt: "2026-09-01T09:00:00.000Z",
    amount: 150,
    currency: "AED",
    confirmationStatus: "confirmed",
    attributionStatus: "matched",
    collectionStatus: "open",
    workState: "collectible",
    locationLabel: null,
    gate: null,
    vehicle: null,
    contract: null,
    customer: null,
    company,
    prediction: { predictedByGps: false, confidence: null },
    authoritative: { confirmed: true, externalReference: id },
  };
}

const query = (partial: Partial<RoadLiabilitiesListQuery>): RoadLiabilitiesListQuery => ({
  ...DEFAULT_ROAD_LIABILITIES_QUERY,
  ...partial,
});

describe("Road liability company filter", () => {
  it("defaults to All Companies", () => {
    assert.equal(DEFAULT_ROAD_LIABILITIES_QUERY.companyId, null);
  });

  it("omits companyId from the request under All Companies", () => {
    const search = new URLSearchParams(buildRoadLiabilitiesQuery(query({})));
    assert.equal(search.has("companyId"), false);
  });

  it("sends the authoritative company id and lets the Backend scope the rows", () => {
    const search = new URLSearchParams(buildRoadLiabilitiesQuery(query({ companyId: 2 })));
    assert.equal(search.get("companyId"), "2");
  });

  it("composes with search, queue and the other filters", () => {
    const search = new URLSearchParams(
      buildRoadLiabilitiesQuery(
        query({
          companyId: 1,
          search: "DE-2026",
          queue: "collectible",
          collectionStatus: "open",
          channel: "SALIK",
        }),
      ),
    );
    assert.equal(search.get("companyId"), "1");
    assert.equal(search.get("search"), "DE-2026");
    assert.equal(search.get("queue"), "collectible");
    assert.equal(search.get("collectionStatus"), "open");
    assert.equal(search.get("channel"), "SALIK");
  });

  it("clears back to All Companies with the rest of the query", () => {
    const store = read("stores/road-liabilities.store.ts");
    const reset = store.slice(store.indexOf("resetFilters()"));
    assert.ok(reset.includes("companyFilter: null"));
    // setQuery keeps the company in the keyed query that the list request reads.
    assert.ok(store.includes("companyId: state.companyFilter"));
    assert.ok(store.includes("companyFilter: nextQuery.companyId"));
  });
});

describe("Road liability company display", () => {
  it("shows every matched company and keeps All Companies inclusive of unmatched", () => {
    const items = [item("u", UNIQUE), item("e", ELITE), item("orphan", null)];

    assert.equal(filterSimulatedLiabilities(items, query({})).length, 3);
    assert.deepEqual(
      filterSimulatedLiabilities(items, query({ companyId: 1 })).map((row) => row.id),
      ["u"],
    );
    assert.deepEqual(
      filterSimulatedLiabilities(items, query({ companyId: 2 })).map((row) => row.id),
      ["e"],
    );
  });

  it("never renders an unmatched liability as a company", () => {
    const row = read("components/road-liability-row/road-liability-row.tsx");
    assert.ok(row.includes("CompanyIdentity"));
    assert.ok(row.includes("item.company"));
    // The unmatched branch is a neutral label, not a fabricated CompanyIdentity.
    assert.ok(row.includes('tCompany("unmatched")'));
    assert.equal(row.includes('"UNIQUE"'), false);
    assert.equal(row.includes('"ELITE"'), false);
  });

  it("shows the company on the detail drawer as identity, not a status chip", () => {
    const detail = read("components/road-liability-detail/road-liability-detail.tsx");
    assert.ok(detail.includes("CompanyIdentity"));
    assert.ok(detail.includes("detail.company"));
    assert.equal(/<Chip[^>]*company/i.test(detail), false);
  });

  it("builds its filter options from the authoritative company store", () => {
    const toolbar = read("components/road-liabilities-toolbar/road-liabilities-toolbar.tsx");
    assert.ok(toolbar.includes("ALL_COMPANIES"));
    assert.ok(toolbar.includes("company.displayName"));
    assert.ok(toolbar.includes("onCompanyFilter"));
    assert.equal(toolbar.includes('"UNIQUE"'), false);
    assert.equal(toolbar.includes('"ELITE"'), false);

    const screen = read("components/road-liabilities-screen/road-liabilities-screen.tsx");
    assert.ok(screen.includes("useOperatingCompanies"));
    assert.equal(screen.includes("apiRequest"), false);
    assert.equal(screen.includes("fetch("), false);
  });

  it("goes through the hook and store, never straight to the API", () => {
    const hook = read("hooks/use-road-liabilities.ts");
    assert.ok(hook.includes("setCompanyFilter"));
    assert.ok(hook.includes("setQuery({ companyId, page: 1 })"));
    assert.equal(hook.includes("apiRequest"), false);
  });

  it("does not reproduce the Contract-first / Vehicle-fallback precedence", () => {
    for (const file of [
      "utils/road-liability-filters.ts",
      "components/road-liability-row/road-liability-row.tsx",
      "components/road-liability-detail/road-liability-detail.tsx",
    ]) {
      const source = read(file);
      assert.equal(
        /contract\??\.company/.test(source),
        false,
        `${file} must not derive company from the contract itself`,
      );
      assert.equal(
        /vehicle\??\.company/.test(source),
        false,
        `${file} must not derive company from the vehicle itself`,
      );
    }
  });
});

describe("Road liability company i18n", () => {
  it("reuses the shared OperatingCompanies namespace in AR and EN", () => {
    for (const locale of ["ar", "en"]) {
      const messages = JSON.parse(
        readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), "utf8"),
      ) as { OperatingCompanies: Record<string, string> };
      for (const key of ["company", "all", "loading", "unmatched"]) {
        assert.equal(
          typeof messages.OperatingCompanies[key],
          "string",
          `${locale}.json is missing OperatingCompanies.${key}`,
        );
        assert.ok(messages.OperatingCompanies[key].length > 0);
      }
    }
  });
});
