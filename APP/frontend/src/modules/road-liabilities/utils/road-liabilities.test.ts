import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { formatAed } from "../../dashboard/utils/money.ts";
import {
  ROAD_LIABILITIES_PAGE_PERMISSIONS,
  VIOLATIONS_READ_PERMISSION,
} from "../road-liabilities.permissions.ts";
import type { RoadLiabilityListItemDto } from "../types/road-liabilities.types.ts";
import {
  buildRoadLiabilitiesQuery,
  countRoadLiabilityAdvancedFilters,
  DEFAULT_ROAD_LIABILITIES_QUERY,
  filterSimulatedLiabilities,
  paginateItems,
} from "./road-liability-filters.ts";
import { formatConfirmedOpenAmount, formatLiabilityAmount } from "./road-liability-format.ts";
import { buildRoadLiabilitiesSimulationOverlay } from "./road-liability-simulation.ts";
import {
  attributionTranslationKey,
  authorityFromType,
  collectionTranslationKey,
  confirmationTranslationKey,
  isContractStatus,
  isGpsPredictionOnly,
  isGpsThenAuthoritative,
  isSimulatedRoadLiabilityId,
  resolveRowSourceKey,
  sourceFallbackLabel,
  sourceTranslationKey,
  typeTranslationKey,
  workStateTranslationKey,
} from "./road-liability-status.ts";

const en = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "../../../../messages/en.json"), "utf8"),
) as { RoadLiabilities: Record<string, unknown>; navigation: { violations: string } };
const ar = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "../../../../messages/ar.json"), "utf8"),
) as { RoadLiabilities: Record<string, unknown>; navigation: { violations: string } };

function predictionItem(
  extra: Partial<RoadLiabilityListItemDto> = {},
): RoadLiabilityListItemDto {
  return {
    id: "real-1",
    type: "salik_toll",
    source: null,
    occurredAt: "2026-09-10T10:31:00.000Z",
    amount: null,
    currency: null,
    confirmationStatus: "pending_confirmation",
    attributionStatus: "matched",
    collectionStatus: "not_ready",
    workState: "awaiting_confirmation",
    locationLabel: "Al Barsha",
    gate: null,
    vehicle: {
      id: 1,
      displayName: "BMW 730Li",
      plateNumber: "A 12345",
      primaryImageUrl: null,
      operationalStatus: "rented",
    },
    contract: { id: "c1", contractNumber: "DE-1", status: "ACTIVE" },
    customer: { displayName: "Demo Customer" },
    prediction: { predictedByGps: true, confidence: "high" },
    authoritative: { confirmed: false, externalReference: null },
    ...extra,
  };
}

describe("violations.read permission", () => {
  it("gates the page on violations.read only", () => {
    assert.equal(VIOLATIONS_READ_PERMISSION, "violations.read");
    assert.deepEqual([...ROAD_LIABILITIES_PAGE_PERMISSIONS], ["violations.read"]);
  });

  it("protects the screen with the catalog permission, not a role name", () => {
    const hook = readFileSync(
      path.join(import.meta.dirname, "../hooks/use-road-liabilities.ts"),
      "utf8",
    );
    const screen = readFileSync(
      path.join(import.meta.dirname, "../components/road-liabilities-screen/road-liabilities-screen.tsx"),
      "utf8",
    );
    const nav = readFileSync(
      path.join(import.meta.dirname, "../../navigation/navigation.config.ts"),
      "utf8",
    );
    assert.ok(hook.includes("ROAD_LIABILITIES_PAGE_PERMISSIONS"));
    assert.ok(hook.includes("isAllowed"));
    assert.ok(screen.includes("page.isAllowed"));
    assert.ok(screen.includes("denied"));
    assert.equal(screen.includes("system_admin"), false);
    assert.ok(nav.includes('permission: "violations.read"'));
    assert.equal(/key:\s*"violations"[\s\S]{0,200}adminOnly:\s*true/.test(nav), false);
  });
});

describe("summary rendering and confirmed amount", () => {
  it("formats confirmed open amount from the backend value", () => {
    assert.equal(formatConfirmedOpenAmount(654), formatAed(654));
    assert.equal(formatConfirmedOpenAmount(0), "AED 0");
    assert.equal(formatConfirmedOpenAmount(654), "AED 654");
  });

  it("uses three primary KPI fields including unique needsAttentionCount", () => {
    const overlay = buildRoadLiabilitiesSimulationOverlay();
    assert.equal(overlay.summary.confirmedOpenAmount, 758);
    assert.equal(overlay.summary.pendingConfirmationCount, 1);
    assert.equal(overlay.summary.needsAttentionCount, 3);
    const summary = readFileSync(
      path.join(
        import.meta.dirname,
        "../components/road-liabilities-summary/road-liabilities-summary.tsx",
      ),
      "utf8",
    );
    assert.ok(summary.includes("kpi.collectibleAmount"));
    assert.ok(summary.includes("pendingConfirmationCount"));
    assert.ok(summary.includes("needsAttentionCount"));
    assert.equal(summary.includes("unmatchedCount"), false);
    assert.equal(summary.includes("byType"), false);
    const kpi = en.RoadLiabilities.kpi as Record<string, string>;
    const kpiAr = ar.RoadLiabilities.kpi as Record<string, string>;
    assert.equal(kpi.collectibleAmount, "Collectible Amount");
    assert.equal(kpi.awaiting, "Awaiting Confirmation");
    assert.equal(kpi.needsAttention, "Needs Attention");
    assert.equal(kpiAr.collectibleAmount, "المبلغ المستحق للتحصيل");
    assert.equal(kpiAr.awaiting, "بانتظار التأكيد");
    assert.equal(kpiAr.needsAttention, "تحتاج مراجعة");
  });

  it("does not fold GPS predictions into the confirmed amount helper", () => {
    const overlay = buildRoadLiabilitiesSimulationOverlay();
    const pending = overlay.items.find(isGpsPredictionOnly);
    assert.ok(pending);
    assert.equal(pending.amount, null);
    assert.equal(overlay.summary.confirmedOpenAmount, 758);
    assert.equal(pending.amount == null || pending.amount === 0, true);
    assert.notEqual(overlay.summary.confirmedOpenAmount, pending.amount);
  });
});

describe("pending GPS amount", () => {
  it("shows Awaiting Official Amount instead of AED 0", () => {
    const display = formatLiabilityAmount(predictionItem({ amount: null }));
    assert.deepEqual(display, { kind: "awaiting" });
    assert.notEqual(JSON.stringify(display).includes("AED 0"), true);
  });
});

describe("list labels and three status dimensions", () => {
  it("labels RTA Violation, Salik Toll, and Salik Violation without calling a toll a violation", () => {
    assert.equal(typeTranslationKey("rta_violation"), "type.rta_violation");
    assert.equal(typeTranslationKey("salik_toll"), "type.salik_toll");
    assert.equal(typeTranslationKey("salik_violation"), "type.salik_violation");
    const types = en.RoadLiabilities.type as Record<string, string>;
    const typesAr = ar.RoadLiabilities.type as Record<string, string>;
    assert.equal(types.rta_violation, "RTA Violation");
    assert.equal(types.salik_toll, "Salik Toll");
    assert.equal(types.salik_violation, "Salik Violation");
    assert.equal(types.salik_toll.includes("Violation"), false);
    assert.equal(typesAr.rta_violation, "مخالفة RTA");
    assert.equal(typesAr.salik_toll, "رسوم سالك");
    assert.equal(typesAr.salik_violation, "مخالفة سالك");
  });

  it("labels RTA, Salik, and GPS Detection sources", () => {
    assert.equal(sourceTranslationKey("RTA"), "source.RTA");
    assert.equal(sourceTranslationKey("SALIK"), "source.SALIK");
    assert.equal(sourceTranslationKey("GPS_INFERENCE"), "source.GPS_INFERENCE");
    const sources = en.RoadLiabilities.source as Record<string, string>;
    const sourcesAr = ar.RoadLiabilities.source as Record<string, string>;
    assert.equal(sources.RTA, "RTA");
    assert.equal(sources.SALIK, "Salik");
    assert.equal(sources.GPS_INFERENCE, "GPS Detection");
    assert.equal(sourcesAr.GPS_INFERENCE, "رصد GPS");
    assert.equal(sourceTranslationKey("FUTURE_X"), null);
    assert.equal(sourceFallbackLabel("FUTURE_X"), "FUTURE X");
  });

  it("keeps confirmation, attribution, and collection as separate dimensions", () => {
    assert.equal(
      confirmationTranslationKey("pending_confirmation"),
      "confirmation.pending_confirmation",
    );
    assert.equal(attributionTranslationKey("matched"), "attribution.matched");
    assert.equal(collectionTranslationKey("open"), "collection.open");
    const confirmation = en.RoadLiabilities.confirmation as Record<string, string>;
    const attribution = en.RoadLiabilities.attribution as Record<string, string>;
    const collection = en.RoadLiabilities.collection as Record<string, string>;
    assert.equal(confirmation.pending_confirmation, "Awaiting Confirmation");
    assert.equal(confirmation.confirmed, "Confirmed");
    assert.equal(confirmation.rejected, "Rejected");
    assert.equal(attribution.matched, "Contract Matched");
    assert.equal(attribution.unmatched, "Unmatched");
    assert.equal(attribution.ambiguous, "Ambiguous Match");
    assert.equal(attribution.unresolved, "Attribution Pending");
    assert.equal(collection.not_ready, "Not Ready for Collection");
    assert.equal(collection.open, "Open for Collection");
    assert.equal(collection.settled, "Settled");
    assert.equal(collection.disputed, "Disputed");
    assert.equal(collection.void, "Void");
    const confirmationAr = ar.RoadLiabilities.confirmation as Record<string, string>;
    const attributionAr = ar.RoadLiabilities.attribution as Record<string, string>;
    const collectionAr = ar.RoadLiabilities.collection as Record<string, string>;
    assert.equal(confirmationAr.pending_confirmation, "بانتظار التأكيد");
    assert.equal(attributionAr.matched, "مرتبطة بالعقد");
    assert.equal(collectionAr.open, "مستحقة للتحصيل");
  });

  it("does not present a GPS prediction as confirmed debt", () => {
    const item = predictionItem();
    assert.equal(isGpsPredictionOnly(item), true);
    assert.equal(item.authoritative.confirmed, false);
    assert.equal(item.confirmationStatus, "pending_confirmation");
    assert.equal(item.collectionStatus, "not_ready");
    assert.equal(formatLiabilityAmount(item).kind, "awaiting");
  });
});

describe("search and filters", () => {
  it("sends applied search only, never a draft on every keystroke", () => {
    const query = buildRoadLiabilitiesQuery({
      ...DEFAULT_ROAD_LIABILITIES_QUERY,
      search: "Patrol",
    });
    assert.ok(query.includes("search=Patrol"));
    const empty = buildRoadLiabilitiesQuery(DEFAULT_ROAD_LIABILITIES_QUERY);
    assert.equal(empty.includes("search="), false);
    const hook = readFileSync(
      path.join(import.meta.dirname, "../hooks/use-road-liabilities.ts"),
      "utf8",
    );
    assert.ok(hook.includes("applySearch"));
    assert.ok(hook.includes("search.trim()"));
  });

  it("maps queue, channel, and detailed filters to backend query params", () => {
    const query = buildRoadLiabilitiesQuery({
      ...DEFAULT_ROAD_LIABILITIES_QUERY,
      queue: "needs_attention",
      channel: "SALIK",
      type: "salik_toll",
      sourceKey: "GPS_INFERENCE",
      confirmationStatus: "pending_confirmation",
      attributionStatus: "matched",
      collectionStatus: "not_ready",
      page: 2,
      pageSize: 20,
    });
    assert.ok(query.includes("queue=needs_attention"));
    assert.ok(query.includes("channel=SALIK"));
    assert.ok(query.includes("type=salik_toll"));
    assert.ok(query.includes("sourceKey=GPS_INFERENCE"));
    assert.ok(query.includes("confirmationStatus=pending_confirmation"));
    assert.ok(query.includes("attributionStatus=matched"));
    assert.ok(query.includes("collectionStatus=not_ready"));
    assert.ok(query.includes("page=2"));
    assert.equal(query.includes("sort="), false);
    const all = buildRoadLiabilitiesQuery(DEFAULT_ROAD_LIABILITIES_QUERY);
    assert.equal(all.includes("queue="), false);
    assert.equal(all.includes("channel="), false);
    const rta = buildRoadLiabilitiesQuery({
      ...DEFAULT_ROAD_LIABILITIES_QUERY,
      channel: "RTA",
    });
    assert.ok(rta.includes("channel=RTA"));
    assert.equal(rta.includes("GPS"), false);
  });

  it("sends occurredFrom / occurredTo from the date range", () => {
    const query = buildRoadLiabilitiesQuery({
      ...DEFAULT_ROAD_LIABILITIES_QUERY,
      from: "2026-09-01",
      to: "2026-09-10",
    });
    assert.ok(query.includes("occurredFrom=2026-09-01T00%3A00%3A00.000Z"));
    assert.ok(query.includes("occurredTo=2026-09-10T23%3A59%3A59.000Z"));
  });

  it("counts advanced filters without search, channel, date, or queue", () => {
    assert.equal(countRoadLiabilityAdvancedFilters(DEFAULT_ROAD_LIABILITIES_QUERY), 0);
    const mixed: typeof DEFAULT_ROAD_LIABILITIES_QUERY = {
      ...DEFAULT_ROAD_LIABILITIES_QUERY,
      type: "rta_violation",
      confirmationStatus: "confirmed",
      search: "A 12345",
      channel: "RTA",
      queue: "collectible",
    };
    assert.equal(countRoadLiabilityAdvancedFilters(mixed), 2);
  });
});

describe("pagination and detail fetch", () => {
  it("uses server page params and does not invent client sort", () => {
    const query = buildRoadLiabilitiesQuery({
      ...DEFAULT_ROAD_LIABILITIES_QUERY,
      page: 3,
      pageSize: 20,
    });
    assert.ok(query.includes("page=3"));
    assert.ok(query.includes("pageSize=20"));
    const paged = paginateItems(["a", "b", "c"], 2, 2);
    assert.deepEqual(paged.data, ["c"]);
    assert.equal(paged.totalPages, 2);
  });

  it("fetches detail only after selection and never for simulated ids", () => {
    const store = readFileSync(
      path.join(import.meta.dirname, "../stores/road-liabilities.store.ts"),
      "utf8",
    );
    const loadFn = store.slice(store.indexOf("async load()"), store.indexOf("async refresh()"));
    assert.equal(loadFn.includes("loadDetail"), false);
    assert.equal(loadFn.includes("getRoadLiability("), false);
    assert.ok(store.includes("selectLiability"));
    assert.ok(store.includes("if (!isSimulatedRoadLiabilityId(id))"));
    assert.ok(store.includes("void loadDetail"));
    assert.equal(store.includes("persist("), false);
    assert.equal(store.includes("localStorage"), false);
  });
});

describe("provenance, contract, and GPS navigation", () => {
  it("keeps provenance chronological in the simulation overlay", () => {
    const overlay = buildRoadLiabilitiesSimulationOverlay();
    const confirmed = overlay.details["sim-rl-gps-salik"];
    assert.ok(confirmed);
    assert.equal(confirmed.provenance.length, 2);
    assert.equal(confirmed.provenance[0]?.sourceKey, "GPS_INFERENCE");
    assert.equal(confirmed.provenance[0]?.authoritative, false);
    assert.equal(confirmed.provenance[1]?.sourceKey, "SALIK");
    assert.equal(confirmed.provenance[1]?.authoritative, true);
  });

  it("wires Contract Drawer and GPS deep-link from the screen", () => {
    const screen = readFileSync(
      path.join(import.meta.dirname, "../components/road-liabilities-screen/road-liabilities-screen.tsx"),
      "utf8",
    );
    const detail = readFileSync(
      path.join(import.meta.dirname, "../components/road-liability-detail/road-liability-detail.tsx"),
      "utf8",
    );
    assert.ok(screen.includes("ContractDetailDrawer"));
    assert.ok(screen.includes("gps?vehicleId="));
    assert.ok(detail.includes("viewContract"));
    assert.ok(detail.includes("viewGps"));
    assert.equal(detail.includes("Mark Paid"), false);
    assert.equal(detail.includes("Notify"), false);
  });
});

describe("empty real state", () => {
  it("ships a finished empty state without an Add control", () => {
    const empty = readFileSync(
      path.join(import.meta.dirname, "../components/road-liabilities-empty/road-liabilities-empty.tsx"),
      "utf8",
    );
    const screen = readFileSync(
      path.join(import.meta.dirname, "../components/road-liabilities-screen/road-liabilities-screen.tsx"),
      "utf8",
    );
    assert.ok(empty.includes("empty.title"));
    assert.equal(empty.includes("Add"), false);
    assert.equal(screen.includes("Add"), false);
    const copy = en.RoadLiabilities.empty as Record<string, string>;
    assert.ok(copy.title.includes("No road liabilities"));
  });
});

describe("Demo Simulation overlay", () => {
  it("is hidden unless the existing simulation architecture is enabled", () => {
    const screen = readFileSync(
      path.join(import.meta.dirname, "../components/road-liabilities-screen/road-liabilities-screen.tsx"),
      "utf8",
    );
    assert.ok(screen.includes("SimulationButton"));
    assert.ok(screen.includes('surface="violations"'));
    const button = readFileSync(
      path.join(import.meta.dirname, "../../demo-simulation/components/simulation-button/simulation-button.tsx"),
      "utf8",
    );
    assert.ok(button.includes('if (!simulation.enabled) return null'));
  });

  it("covers GPS pending, GPS then Salik, RTA, unmatched, ambiguous, and settled", () => {
    const overlay = buildRoadLiabilitiesSimulationOverlay();
    assert.ok(overlay.items.length >= 6);
    assert.ok(overlay.items.length <= 9);
    const pending = overlay.items.find((item) => item.id === "sim-rl-gps-pending");
    const confirmed = overlay.items.find((item) => item.id === "sim-rl-gps-salik");
    const rta = overlay.items.find((item) => item.id === "sim-rl-rta-open");
    const unmatched = overlay.items.find((item) => item.id === "sim-rl-salik-unmatched");
    const ambiguous = overlay.items.find((item) => item.id === "sim-rl-rta-ambiguous");
    const settled = overlay.items.find((item) => item.id === "sim-rl-salik-settled");
    assert.ok(pending && confirmed && rta && unmatched && ambiguous && settled);
    assert.equal(pending.amount, null);
    assert.equal(isGpsPredictionOnly(pending), true);
    assert.equal(isGpsThenAuthoritative(confirmed), true);
    assert.equal(confirmed.amount, 4);
    assert.equal(rta.type, "rta_violation");
    assert.equal(rta.confirmationStatus, "confirmed");
    assert.equal(rta.contract?.status, "REVIEW");
    assert.equal(rta.amount, 600);
    const attachedViolation = overlay.items.find((item) => item.id === "sim-rl-salik-violation");
    assert.equal(attachedViolation?.reconciliationAttached, true);
    assert.equal(unmatched.attributionStatus, "unmatched");
    assert.equal(ambiguous.attributionStatus, "ambiguous");
    assert.equal(settled.collectionStatus, "settled");
    assert.equal(pending.workState, "awaiting_confirmation");
    assert.equal(confirmed.workState, "collectible");
    assert.equal(rta.workState, "collectible");
    assert.equal(unmatched.workState, "needs_contract");
    assert.equal(ambiguous.workState, "ambiguous_match");
    assert.equal(settled.workState, "settled");
    assert.equal(overlay.summary.needsAttentionCount, 3);
    assert.equal(resolveRowSourceKey(pending), "GPS_INFERENCE");
    assert.equal(authorityFromType(pending.type), "SALIK");
    assert.equal(authorityFromType(rta.type), "RTA");
  });

  it("serves simulated detail locally and never writes to backend", () => {
    const overlay = buildRoadLiabilitiesSimulationOverlay();
    assert.ok(overlay.details["sim-rl-gps-pending"]);
    assert.equal(isSimulatedRoadLiabilityId("sim-rl-gps-pending"), true);
    assert.equal(isSimulatedRoadLiabilityId("aaaaaaaa-bbbb-4000-8000-ffffffffffff"), false);
    const api = readFileSync(path.join(import.meta.dirname, "../api/road-liabilities.api.ts"), "utf8");
    assert.equal(/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(api), false);
    assert.ok(api.includes("GET /road-liabilities/summary"));
    assert.ok(api.includes("GET /road-liabilities"));
    assert.ok(api.includes("GET /road-liabilities/:id"));
    const store = readFileSync(
      path.join(import.meta.dirname, "../../demo-simulation/simulation.store.ts"),
      "utf8",
    );
    assert.ok(store.includes("roadLiabilitiesOverlay"));
    assert.ok(store.includes("simulateRoadLiabilities"));
    assert.equal(/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(store), false);
  });

  it("filters overlay items in memory without calling backend ids", () => {
    const overlay = buildRoadLiabilitiesSimulationOverlay();
    const gps = filterSimulatedLiabilities(overlay.items, {
      ...DEFAULT_ROAD_LIABILITIES_QUERY,
      sourceKey: "GPS_INFERENCE",
    });
    assert.ok(gps.every((item) => item.prediction.predictedByGps));
    const search = filterSimulatedLiabilities(overlay.items, {
      ...DEFAULT_ROAD_LIABILITIES_QUERY,
      search: "RTA-24891",
    });
    assert.equal(search.length, 1);
    assert.equal(search[0]?.id, "sim-rl-rta-open");
    const collectible = filterSimulatedLiabilities(overlay.items, {
      ...DEFAULT_ROAD_LIABILITIES_QUERY,
      queue: "collectible",
    });
    assert.ok(collectible.every((item) => item.workState === "collectible"));
    assert.equal(collectible.some((item) => item.id === "sim-rl-gps-pending"), false);
    const attention = filterSimulatedLiabilities(overlay.items, {
      ...DEFAULT_ROAD_LIABILITIES_QUERY,
      queue: "needs_attention",
    });
    assert.equal(attention.length, 3);
    const salikChannel = filterSimulatedLiabilities(overlay.items, {
      ...DEFAULT_ROAD_LIABILITIES_QUERY,
      channel: "SALIK",
    });
    assert.ok(salikChannel.some((item) => item.id === "sim-rl-gps-pending"));
    assert.ok(salikChannel.every((item) => item.type !== "rta_violation"));
    const rtaChannel = filterSimulatedLiabilities(overlay.items, {
      ...DEFAULT_ROAD_LIABILITIES_QUERY,
      channel: "RTA",
    });
    assert.ok(rtaChannel.every((item) => item.type === "rta_violation"));
  });
});

describe("AR and EN page titles", () => {
  it("uses Violations & Salik / المخالفات وسالك", () => {
    assert.equal((en.RoadLiabilities.title as string), "Violations & Salik");
    assert.equal((ar.RoadLiabilities.title as string), "المخالفات وسالك");
    assert.equal(en.navigation.violations, "Violations & Salik");
    assert.equal(ar.navigation.violations, "المخالفات وسالك");
  });
});

describe("work queues, workState, and simplified surfaces", () => {
  it("labels workState without exposing raw enums", () => {
    const pending = predictionItem();
    assert.equal(
      workStateTranslationKey("awaiting_confirmation", pending),
      "workState.awaiting_confirmation_salik",
    );
    assert.equal(workStateTranslationKey("collectible"), "workState.collectible");
    const labels = en.RoadLiabilities.workState as Record<string, string>;
    const labelsAr = ar.RoadLiabilities.workState as Record<string, string>;
    assert.equal(labels.awaiting_confirmation_salik, "Awaiting Salik Confirmation");
    assert.equal(labels.collectible, "Collectible");
    assert.equal(labels.needs_contract, "Contract Match Needed");
    assert.equal(labelsAr.awaiting_confirmation_salik, "بانتظار تأكيد سالك");
    assert.equal(labelsAr.collectible, "مستحقة للتحصيل");
    assert.equal(labelsAr.needs_contract, "تحتاج ربط بعقد");
  });

  it("treats GPS as detection provenance, not an authority", () => {
    assert.equal(authorityFromType("salik_toll"), "SALIK");
    assert.equal(authorityFromType("salik_violation"), "SALIK");
    assert.equal(authorityFromType("rta_violation"), "RTA");
    const toolbar = readFileSync(
      path.join(
        import.meta.dirname,
        "../components/road-liabilities-toolbar/road-liabilities-toolbar.tsx",
      ),
      "utf8",
    );
    assert.ok(toolbar.includes("ROAD_LIABILITY_CHANNELS"));
    assert.ok(toolbar.includes("ROAD_LIABILITY_SOURCES"));
    assert.equal(toolbar.includes("channel.GPS"), false);
    assert.equal(toolbar.includes("TARS"), false);
    assert.ok(toolbar.includes("road-liabilities-advanced-panel"));
    assert.ok(toolbar.includes("filters.advanced"));
    const row = readFileSync(
      path.join(
        import.meta.dirname,
        "../components/road-liability-row/road-liability-row.tsx",
      ),
      "utf8",
    );
    assert.ok(row.includes("authorityFromType"));
    assert.ok(row.includes("workStateTranslationKey"));
    assert.equal(row.includes("confirmationTranslationKey"), false);
    assert.equal(row.includes("TARS"), false);
    const queues = readFileSync(
      path.join(
        import.meta.dirname,
        "../components/road-liabilities-queues/road-liabilities-queues.tsx",
      ),
      "utf8",
    );
    assert.ok(queues.includes("needs_attention"));
    assert.ok(queues.includes("collectible"));
  });

  it("keeps detailed statuses in the drawer and localizes contract status", () => {
    const detail = readFileSync(
      path.join(
        import.meta.dirname,
        "../components/road-liability-detail/road-liability-detail.tsx",
      ),
      "utf8",
    );
    assert.ok(detail.includes("road-liability-event-status"));
    assert.ok(detail.includes("confirmationTranslationKey"));
    assert.ok(detail.includes("attributionTranslationKey"));
    assert.ok(detail.includes("collectionTranslationKey"));
    assert.ok(detail.includes("ContractStatusChip"));
    assert.ok(detail.includes("isContractStatus"));
    assert.equal(detail.includes('value={detail.contract.status}'), false);
    const rowCss = readFileSync(
      path.join(
        import.meta.dirname,
        "../components/road-liability-row/road-liability-row.module.css",
      ),
      "utf8",
    );
    assert.ok(rowCss.includes("data-empty"));
    assert.equal(isContractStatus("ACTIVE"), true);
    assert.equal(isContractStatus("ACTIVE"), true);
  });

  it("does not send mutation requests from the module API", () => {
    const api = readFileSync(path.join(import.meta.dirname, "../api/road-liabilities.api.ts"), "utf8");
    assert.equal(/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(api), false);
  });
});
