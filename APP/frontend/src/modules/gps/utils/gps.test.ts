import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { createFormatter } from "use-intl/core";
import { countsInSummaryOnlineTotal, formatGpsCoordinates, toValidGpsDate } from "./gps-status.ts";
import { buildGpsListQuery } from "./gps-query.ts";
import { shouldInvalidateLeafletSize } from "./gps-map.ts";
import {
  applyGpsOverlayToSummary,
  applyGpsOverlayToVehicle,
  buildGpsSimulationOverlay,
  advanceGpsSimulationPath,
  resolveDisplayMapPoints,
} from "./gps-simulation.ts";
import type {
  GpsSummaryDto,
  GpsTrackingStatus,
  GpsVehicleListItemDto,
} from "../types/gps.types.ts";
import { GPS_TRACKING_FILTERS } from "../types/gps.types.ts";

describe("GPS summary online semantics", () => {
  it("counts moving, parked, and row-level online as summary online", () => {
    assert.equal(countsInSummaryOnlineTotal("moving"), true);
    assert.equal(countsInSummaryOnlineTotal("parked"), true);
    assert.equal(countsInSummaryOnlineTotal("online"), true);
  });

  it("does not count offline, no_data, or unassigned as summary online", () => {
    assert.equal(countsInSummaryOnlineTotal("offline"), false);
    assert.equal(countsInSummaryOnlineTotal("no_data"), false);
    assert.equal(countsInSummaryOnlineTotal("unassigned"), false);
    assert.equal(countsInSummaryOnlineTotal("not_configured"), false);
  });
});

describe("GPS query", () => {
  it("applies search and filters only after explicit values", () => {
    const query = buildGpsListQuery({
      search: "Patrol",
      status: "rented",
      trackingStatus: "moving",
      page: 2,
      pageSize: 8,
    });
    assert.ok(query.includes("search=Patrol"));
    assert.ok(query.includes("status=rented"));
    assert.ok(query.includes("trackingStatus=moving"));
    assert.ok(query.includes("page=2"));
  });

  it("omits all-filters so pagination stays server-side", () => {
    const query = buildGpsListQuery({
      search: "",
      status: "all",
      trackingStatus: "all",
      page: 1,
      pageSize: 8,
    });
    assert.equal(query.includes("search="), false);
    assert.equal(query.includes("status="), false);
    assert.equal(query.includes("trackingStatus="), false);
  });
});

describe("GPS coordinates", () => {
  it("formats coordinates as LTR numeric pairs", () => {
    assert.equal(formatGpsCoordinates(25.2048, 55.2708), "25.2048, 55.2708");
  });
});

describe("GPS Leaflet size sync", () => {
  it("does not invalidate on empty or unchanged boxes", () => {
    assert.equal(shouldInvalidateLeafletSize({ width: 0, height: 0 }, { width: 0, height: 400 }), false);
    assert.equal(
      shouldInvalidateLeafletSize({ width: 900, height: 500 }, { width: 900, height: 500 }),
      false,
    );
  });

  it("invalidates only when the layout box actually changes", () => {
    assert.equal(
      shouldInvalidateLeafletSize({ width: 900, height: 280 }, { width: 900, height: 520 }),
      true,
    );
  });
});

describe("GPS relative time", () => {
  it("rejects missing and invalid timestamps", () => {
    assert.equal(toValidGpsDate(null), null);
    assert.equal(toValidGpsDate(undefined), null);
    assert.equal(toValidGpsDate(""), null);
    assert.equal(toValidGpsDate("not-a-date"), null);
  });

  it("formats localized relative time when now is provided", () => {
    const now = new Date("2026-09-10T12:02:00.000Z");
    const captured = toValidGpsDate("2026-09-10T12:00:00.000Z");
    assert.ok(captured);
    const en = createFormatter({ locale: "en", now });
    const ar = createFormatter({ locale: "ar", now });
    assert.equal(en.relativeTime(captured, now), "2 minutes ago");
    assert.equal(ar.relativeTime(captured, now), "قبل دقيقتين");
  });

  it("uses one shared useNow on the GPS screen, not per row", () => {
    const screen = readFileSync(
      path.join(import.meta.dirname, "../components/gps-screen/gps-screen.tsx"),
      "utf8",
    );
    const row = readFileSync(
      path.join(import.meta.dirname, "../components/gps-vehicle-row/gps-vehicle-row.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      path.join(import.meta.dirname, "../components/gps-vehicle-panel/gps-vehicle-panel.tsx"),
      "utf8",
    );
    assert.ok(screen.includes("useNow({ updateInterval: 60_000 })"));
    assert.ok(row.includes("format.relativeTime(captured, now)"));
    assert.equal(row.includes("useNow"), false);
    assert.equal(panel.includes("useNow"), false);
  });
});

function vehicle(id: number, status: GpsTrackingStatus): GpsVehicleListItemDto {
  return {
    vehicle: {
      id,
      vehicleName: `Car ${id}`,
      displayName: `Car ${id}`,
      vehicleType: "SUV",
      plateNumber: `P-${id}`,
      modelYear: 2024,
      color: "White",
      primaryImageUrl: null,
      operationalStatus: "available",
    },
    gps: {
      trackingStatus: status,
      latitude: null,
      longitude: null,
      speedKph: null,
      headingDegrees: null,
      accuracyMeters: null,
      capturedAt: null,
      receivedAt: null,
      motionState: null,
    },
    currentRental: {
      contractId: "ct-1",
      contractNumber: "DE-1",
      status: "active",
      startAt: "2026-09-01T00:00:00.000Z",
      endAt: "2026-09-10T00:00:00.000Z",
      customerName: "GPS Tester",
    },
  };
}

describe("GPS simulation overlay", () => {
  it("reuses real vehicle ids and never invents a second fleet", () => {
    const overlay = buildGpsSimulationOverlay([11, 12, 13, 14, 15, 16]);
    assert.deepEqual(
      overlay.fixes.map((fix) => fix.vehicleId),
      [11, 12, 13, 14, 15, 16],
    );
    assert.equal(overlay.fixes.filter((fix) => fix.trackingStatus === "moving").length, 2);
    assert.equal(overlay.fixes.filter((fix) => fix.trackingStatus === "parked").length, 2);
    assert.equal(overlay.fixes.filter((fix) => fix.trackingStatus === "online").length, 1);
    assert.equal(overlay.fixes.filter((fix) => fix.trackingStatus === "offline").length, 1);
  });

  it("overlays GPS fields onto a real vehicle without dropping customer/contract", () => {
    const overlay = buildGpsSimulationOverlay([11]);
    const next = applyGpsOverlayToVehicle(vehicle(11, "not_configured"), overlay);
    assert.equal(next.currentRental?.customerName, "GPS Tester");
    assert.equal(next.currentRental?.contractNumber, "DE-1");
    assert.equal(next.gps.trackingStatus, "moving");
    assert.ok(next.gps.latitude != null);
  });

  it("summary online remains the fresh-location total under overlay", () => {
    const overlay = buildGpsSimulationOverlay([1, 2, 3, 4, 5, 6]);
    const summary: GpsSummaryDto = {
      providerConfigured: false,
      totalVehicles: 20,
      trackedVehicles: 0,
      moving: 0,
      parked: 0,
      online: 0,
      offline: 0,
      noData: 0,
      unassigned: 20,
      lastLocationUpdateAt: null,
    };
    const next = applyGpsOverlayToSummary(summary, overlay)!;
    assert.equal(next.online, next.moving + next.parked + 1);
    assert.equal(next.online, 5);
    assert.equal(next.offline, 1);
  });

  it("animates only the selected moving vehicle along the path", () => {
    const overlay = buildGpsSimulationOverlay([11, 12]);
    const next = advanceGpsSimulationPath(overlay);
    const mover = next.fixes.find((fix) => fix.vehicleId === overlay.movingVehicleId);
    const other = next.fixes.find((fix) => fix.vehicleId !== overlay.movingVehicleId);
    assert.equal(next.pathIndex, 1);
    assert.notEqual(mover?.latitude, overlay.fixes[0]?.latitude);
    assert.equal(other?.latitude, overlay.fixes[1]?.latitude);
  });
});

describe("GPS API is read-only", () => {
  it("does not issue write requests", () => {
    const source = readFileSync(path.join(import.meta.dirname, "../api/gps.api.ts"), "utf8");
    assert.equal(/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(source), false);
    assert.ok(source.includes("GET /gps/summary"));
    assert.ok(source.includes("GET /gps/vehicles"));
    assert.ok(source.includes("GET /gps/map-points"));
  });
});

describe("GPS real-mode map points", () => {
  it("does not seed fake coordinates when the overlay is off", () => {
    const points = resolveDisplayMapPoints([], [vehicle(7, "not_configured")], null);
    assert.deepEqual(points, []);
  });

  it("overlays Dubai demo points onto real vehicle ids only", () => {
    const overlay = buildGpsSimulationOverlay([7]);
    const points = resolveDisplayMapPoints([], [vehicle(7, "not_configured")], overlay);
    assert.equal(points.length, 1);
    assert.equal(points[0]?.vehicleId, 7);
    assert.notEqual(points[0]?.latitude, 0);
    assert.notEqual(points[0]?.longitude, 0);
  });
});

describe("GPS store selection", () => {
  it("fetches vehicle detail only after selection", () => {
    const source = readFileSync(path.join(import.meta.dirname, "../stores/gps.store.ts"), "utf8");
    const loadFn = source.slice(source.indexOf("async load()"), source.indexOf("async refresh()"));
    assert.equal(loadFn.includes("loadDetail"), false);
    assert.equal(loadFn.includes("getGpsVehicle"), false);
    assert.ok(source.includes("if (openDetail) void loadDetail"));
    assert.equal(source.includes("persist("), false);
  });
});

describe("GPS filters", () => {
  it("exposes tracking filters for server-side queries", () => {
    assert.deepEqual(GPS_TRACKING_FILTERS, [
      "all",
      "moving",
      "parked",
      "online",
      "offline",
      "no_data",
      "unassigned",
    ]);
  });
});
