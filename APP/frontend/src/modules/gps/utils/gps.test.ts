import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { createFormatter } from "use-intl/core";
import {
  countsInSummaryOnlineTotal,
  deriveDisplayMotionStatus,
  formatGpsCoordinates,
  toValidGpsDate,
} from "./gps-status.ts";
import {
  buildGpsListQuery,
  buildGpsMapQuery,
  countGpsActiveFilters,
} from "./gps-query.ts";
import {
  filterMapPointsForFocus,
  GPS_MAP_FOCUS_FLY_DURATION_S,
  GPS_MAP_FOCUS_MIN_ZOOM,
  interpolateCoordinate,
  markerAnimationDurationMs,
  shouldInvalidateLeafletSize,
  shouldSnapMarker,
} from "./gps-map.ts";
import {
  GPS_MAP_DEFAULT_SATELLITE_ATTRIBUTION,
  GPS_MAP_DEFAULT_SATELLITE_TILE_URL,
  GPS_MAP_OSM_TILE_URL,
  gpsMapBasemapAttributionLabel,
  isGpsSatelliteBasemapEnabled,
  resolveGpsSatelliteBasemap,
} from "./gps-map-basemap-config.ts";
import {
  formatGpsDetailCoordinate,
  formatGpsDetailHeading,
  formatGpsDetailSpeedValue,
  gpsDetailDisplayedSpeedKph,
  gpsDetailEnginePresentationFromMotion,
  gpsDetailProviderLabel,
  headingCardinalKey,
} from "./gps-detail-present.ts";
import {
  clampPlaybackIndex,
  customUaeHistoryRange,
  historyDisplayMotion,
  historyPresetRange,
  playbackDelayMs,
  validateHistoryRange,
} from "./gps-history.ts";
import {
  applyGpsOverlayToSummary,
  applyGpsOverlayToVehicle,
  buildGpsSimulationOverlay,
  advanceGpsSimulationPath,
  resolveDisplayMapPoints,
} from "./gps-simulation.ts";
import { GPS_TRACKING_FILTER_OPTIONS } from "../types/gps.types.ts";
import type {
  GpsSummaryDto,
  GpsTrackingStatus,
  GpsVehicleListItemDto,
} from "../types/gps.types.ts";
import { GPS_TRACKING_FILTERS } from "../types/gps.types.ts";

describe("deriveDisplayMotionStatus (row badge)", () => {
  const NOW = new Date("2026-09-10T12:00:00.000Z");
  const FRESH = new Date("2026-09-10T11:55:00.000Z");
  const STALE = new Date("2026-09-10T11:40:00.000Z");
  const base = {
    providerConfigured: true,
    bindingActive: true,
    capturedAt: FRESH,
    motionState: "parked" as const,
    speedKph: 0,
    ignitionOn: false as boolean | null,
    now: NOW,
    motionStaleAfterMinutes: 15,
    movingThresholdKph: 3,
  };

  it("fresh + moving → moving", () => {
    assert.equal(
      deriveDisplayMotionStatus({
        ...base,
        speedKph: 12,
        motionState: "parked",
        ignitionOn: false,
      }),
      "moving",
    );
  });

  it("fresh + not moving + ignitionOn=true → idle", () => {
    assert.equal(
      deriveDisplayMotionStatus({
        ...base,
        speedKph: 0,
        motionState: "parked",
        ignitionOn: true,
      }),
      "idle",
    );
  });

  it("fresh + not moving + ignitionOn=false → parked", () => {
    assert.equal(
      deriveDisplayMotionStatus({
        ...base,
        speedKph: 0,
        motionState: "parked",
        ignitionOn: false,
      }),
      "parked",
    );
  });

  it("ignition unknown → parked", () => {
    assert.equal(
      deriveDisplayMotionStatus({
        ...base,
        speedKph: 0,
        motionState: "unknown",
        ignitionOn: null,
      }),
      "parked",
    );
  });

  it("stale capture → parked", () => {
    assert.equal(
      deriveDisplayMotionStatus({
        ...base,
        capturedAt: STALE,
        speedKph: 40,
        motionState: "moving",
        ignitionOn: true,
      }),
      "parked",
    );
  });

  it("default 2 min motion stale: T0+1m59s moving, T0+2m01s parked", () => {
    const t0 = new Date("2026-09-10T12:00:00.000Z");
    const freshNow = new Date(t0.getTime() + 119_000);
    const staleNow = new Date(t0.getTime() + 121_000);
    const movingSnapshot = {
      ...base,
      capturedAt: t0,
      motionState: "moving" as const,
      speedKph: 19,
      ignitionOn: true,
      motionStaleAfterMinutes: 2,
    };
    assert.equal(
      deriveDisplayMotionStatus({ ...movingSnapshot, now: freshNow }),
      "moving",
    );
    assert.equal(
      deriveDisplayMotionStatus({ ...movingSnapshot, now: staleNow }),
      "parked",
    );
  });
});

describe("GPS summary online semantics", () => {
  it("counts moving, parked, and row-level online as summary online", () => {
    assert.equal(countsInSummaryOnlineTotal("moving"), true);
    assert.equal(countsInSummaryOnlineTotal("parked"), true);
    assert.equal(countsInSummaryOnlineTotal("online"), true);
  });

  describe("GPS smooth marker movement", () => {
    const pointA = { latitude: 25, longitude: 55 };
    const pointB = { latitude: 25.001, longitude: 55.001 };
    const pointC = { latitude: 25.002, longitude: 55.002 };
    const timeA = "2026-01-01T00:00:00.000Z";
    const timeB = "2026-01-01T00:00:10.000Z";

    it("interpolates A to B and ends exactly at B", () => {
      const middle = interpolateCoordinate(pointA, pointB, 0.5);
      assert.notDeepEqual(middle, pointA);
      assert.deepEqual(interpolateCoordinate(pointA, pointB, 1), pointB);
    });

    it("uses the current rendered point as the new start for an interrupted update", () => {
      const current = interpolateCoordinate(pointA, pointB, 0.4);
      assert.deepEqual(interpolateCoordinate(current, pointC, 1), pointC);
      assert.notDeepEqual(current, pointB);
    });

    it("snaps initial, stale, and large-gap data instead of animating it", () => {
      assert.equal(shouldSnapMarker(pointA, pointB, null, timeB), true);
      assert.equal(shouldSnapMarker(pointA, pointB, timeB, timeA), true);
      assert.equal(
        shouldSnapMarker(pointA, { latitude: 25.05, longitude: 55.05 }, timeA, timeB),
        true,
      );
    });

    it("adapts animation duration to cadence without exceeding the cap", () => {
      assert.equal(shouldSnapMarker(pointA, pointB, timeA, timeB), false);
      assert.equal(markerAnimationDurationMs(timeA, timeB), 3800);
      assert.equal(
        markerAnimationDurationMs(timeA, "2026-01-01T00:00:02.000Z"),
        1600,
      );
      assert.equal(
        markerAnimationDurationMs(timeA, "2026-01-01T00:00:00.100Z"),
        500,
      );
      assert.equal(
        markerAnimationDurationMs(timeA, "2026-01-01T00:00:15.000Z"),
        3800,
      );
    });
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
      companyId: null,
      page: 2,
      pageSize: 8,
    });
    assert.ok(query.includes("search=Patrol"));
    assert.ok(query.includes("status=rented"));
    assert.ok(query.includes("trackingStatus=moving"));
    assert.ok(query.includes("page=2"));
    assert.equal(query.includes("companyId"), false);
  });

  it("sends companyId and composes it with the other filters", () => {
    const query = buildGpsListQuery({
      search: "Patrol",
      status: "rented",
      trackingStatus: "moving",
      companyId: 2,
      page: 1,
      pageSize: 8,
    });
    assert.ok(query.includes("companyId=2"));
    assert.ok(query.includes("search=Patrol"));
    assert.ok(query.includes("status=rented"));
    assert.ok(query.includes("trackingStatus=moving"));
  });

  it("composes provider and company filters independently", () => {
    const query = buildGpsListQuery({
      search: "",
      status: "all",
      trackingStatus: "all",
      companyId: 2,
      providerKey: "SEVEN_STARS",
      page: 1,
      pageSize: 8,
    });
    assert.ok(query.includes("providerKey=SEVEN_STARS"));
    assert.ok(query.includes("companyId=2"));
  });

  it("counts the operating-company filter as an active filter", () => {
    assert.equal(
      countGpsActiveFilters({
        search: "",
        status: "all",
        trackingStatus: "all",
        companyId: null,
      }),
      0,
    );
    assert.equal(
      countGpsActiveFilters({
        search: "",
        status: "all",
        trackingStatus: "all",
        companyId: 2,
      }),
      1,
    );
  });

  it("counts a provider filter and omits the all-provider value", () => {
    assert.equal(
      countGpsActiveFilters({
        search: "",
        status: "all",
        trackingStatus: "all",
        companyId: null,
        providerKey: "all",
      }),
      0,
    );
    assert.equal(
      countGpsActiveFilters({
        search: "",
        status: "all",
        trackingStatus: "all",
        companyId: null,
        providerKey: "LIVE_GPS",
      }),
      1,
    );
  });

  it("omits all-filters so pagination stays server-side", () => {
    const query = buildGpsListQuery({
      search: "",
      status: "all",
      trackingStatus: "all",
      companyId: null,
      page: 1,
      pageSize: 8,
    });
    assert.equal(query.includes("search="), false);
    assert.equal(query.includes("status="), false);
    assert.equal(query.includes("trackingStatus="), false);
  });

  it("serializes display motion tracking filters including idle", () => {
    for (const trackingStatus of ["moving", "idle", "parked"] as const) {
      const query = buildGpsListQuery({
        search: "",
        status: "all",
        trackingStatus,
        companyId: null,
        providerKey: "SEVEN_STARS",
        page: 1,
        pageSize: 8,
      });
      assert.ok(query.includes(`trackingStatus=${trackingStatus}`));
      assert.ok(query.includes("providerKey=SEVEN_STARS"));
    }
  });
});

describe("GPS map query", () => {
  it("serializes provider, company, and display motion for map-points", () => {
    const query = buildGpsMapQuery({
      companyId: 1,
      providerKey: "SEVEN_STARS",
      trackingStatus: "idle",
    });
    assert.ok(query.includes("companyId=1"));
    assert.ok(query.includes("providerKey=SEVEN_STARS"));
    assert.ok(query.includes("trackingStatus=idle"));
  });

  it("omits trackingStatus when filter is all", () => {
    const query = buildGpsMapQuery({
      companyId: null,
      providerKey: "all",
      trackingStatus: "all",
    });
    assert.equal(query.includes("trackingStatus="), false);
  });
});

describe("GPS tracking filter options", () => {
  it("exposes only All / Moving / Idle / Parked on the GPS page", () => {
    assert.deepEqual(GPS_TRACKING_FILTER_OPTIONS, ["all", "moving", "idle", "parked"]);
    assert.equal(GPS_TRACKING_FILTER_OPTIONS.includes("offline"), false);
    assert.equal(GPS_TRACKING_FILTER_OPTIONS.includes("no_data"), false);
    assert.equal(GPS_TRACKING_FILTER_OPTIONS.includes("online"), false);
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
      company: {
        id: 1,
        code: "UNIQUE",
        displayName: "UNIQUE",
        accentColor: "#C9A15C",
      },
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
      ignitionOn: null,
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
      idle: 0,
      parked: 20,
      online: 0,
      offline: 0,
      noData: 0,
      unassigned: 20,
      lastLocationUpdateAt: null,
    };
    const next = applyGpsOverlayToSummary(summary, overlay)!;
    assert.equal(next.moving + next.idle + next.parked, next.totalVehicles);
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
    assert.ok(source.includes("GET /gps/vehicles/:vehicleId/history"));
    assert.equal(source.includes("externalDeviceId"), false);
  });
});

describe("GPS history range and playback", () => {
  it("builds one, six, and twenty-four hour presets", () => {
    const now = new Date("2026-10-09T12:00:00.000Z");
    assert.equal(
      Date.parse(historyPresetRange("last1h", now).to) -
        Date.parse(historyPresetRange("last1h", now).from),
      60 * 60 * 1_000,
    );
    assert.equal(
      Date.parse(historyPresetRange("last6h", now).to) -
        Date.parse(historyPresetRange("last6h", now).from),
      6 * 60 * 60 * 1_000,
    );
    assert.equal(
      Date.parse(historyPresetRange("last24h", now).to) -
        Date.parse(historyPresetRange("last24h", now).from),
      24 * 60 * 60 * 1_000,
    );
  });

  it("converts custom UAE local date/time to UTC ISO", () => {
    assert.deepEqual(
      customUaeHistoryRange("2026-10-09", "08:30", "2026-10-09", "09:30"),
      {
        from: "2026-10-09T04:30:00.000Z",
        to: "2026-10-09T05:30:00.000Z",
      },
    );
  });

  it("rejects invalid and over-seven-day custom ranges before fetching", () => {
    assert.deepEqual(
      validateHistoryRange(
        {
          from: "2026-10-01T00:00:00.000Z",
          to: "2026-10-09T00:00:00.001Z",
        },
        new Date("2026-10-09T12:00:00.000Z"),
      ),
      { valid: false, reason: "too_large" },
    );
    assert.deepEqual(
      validateHistoryRange(
        {
          from: "2026-10-09T02:00:00.000Z",
          to: "2026-10-09T01:00:00.000Z",
        },
        new Date("2026-10-09T12:00:00.000Z"),
      ),
      { valid: false, reason: "invalid" },
    );
  });

  it("supports playback speeds, scrubber bounds, and display-only motion", () => {
    assert.ok(playbackDelayMs("8") < playbackDelayMs("1"));
    assert.equal(clampPlaybackIndex(-5, 4), 0);
    assert.equal(clampPlaybackIndex(99, 4), 3);
    assert.equal(historyDisplayMotion(4), "moving");
    assert.equal(historyDisplayMotion(0), "stopped");
    assert.equal(historyDisplayMotion(null), "stopped");
  });

  it("uses a polyline plus start, end, and one active marker", () => {
    const canvas = readFileSync(
      path.join(
        import.meta.dirname,
        "../components/gps-history/gps-history-map-canvas.tsx",
      ),
      "utf8",
    );
    assert.ok(canvas.includes("L.polyline"));
    assert.ok(canvas.includes('historyIcon("start"'));
    assert.ok(canvas.includes('historyIcon("end"'));
    assert.ok(canvas.includes('historyIcon("active"'));
    assert.equal(canvas.includes("points.map((point) => L.marker"), false);
  });

  it("keeps API-backed history in a cancellable non-persisted store", () => {
    const store = readFileSync(
      path.join(import.meta.dirname, "../stores/gps-history.store.ts"),
      "utf8",
    );
    assert.ok(store.includes("AbortController"));
    assert.ok(store.includes("activeController?.abort()"));
    assert.equal(store.includes("persist("), false);
    assert.equal(store.includes("setInterval"), false);
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

describe("GPS map interaction scroll guard", () => {
  it("disables Leaflet keyboard focus and uses natural GPS page height flow", () => {
    const canvas = readFileSync(
      path.join(import.meta.dirname, "../components/gps-map/gps-map-canvas.tsx"),
      "utf8",
    );
    const screenCss = readFileSync(
      path.join(import.meta.dirname, "../components/gps-screen/gps-screen.module.css"),
      "utf8",
    );
    assert.ok(canvas.includes("keyboard: false"));
    assert.equal(screenCss.includes("height: calc(100dvh - 118px)"), false);
    assert.ok(screenCss.includes("height: auto"));
    assert.ok(screenCss.includes("overflow: visible"));
  });
});

describe("GPS operations workspace layout", () => {
  it("composes fleet column and map hero without touching data hooks", () => {
    const screen = readFileSync(
      path.join(import.meta.dirname, "../components/gps-screen/gps-screen.tsx"),
      "utf8",
    );
    const layout = readFileSync(
      path.join(import.meta.dirname, "../components/gps-screen/gps-screen.module.css"),
      "utf8",
    );
    assert.ok(screen.includes("styles.workspace"));
    assert.ok(screen.includes("styles.fleetCol"));
    assert.ok(screen.includes("styles.mapCol"));
    assert.ok(screen.includes("className={styles.fleetCol}"));
    assert.ok(screen.includes("className={styles.mapCol}"));
    assert.ok(layout.includes("0.68fr"));
    assert.ok(layout.includes("clamp(520px, 65vh, 760px)"));
    assert.ok(layout.includes("@media (min-width: 1081px)"));
    assert.ok(layout.includes("max-height: var(--gps-map-min-h)"));
    assert.equal(screen.includes("apiRequest"), false);
  });

  it("keeps StatCard shared defaults while allowing GPS KPI className", () => {
    const statCard = readFileSync(
      path.join(
        import.meta.dirname,
        "../../../shared/components/ui/stat-card/stat-card.tsx",
      ),
      "utf8",
    );
    const summary = readFileSync(
      path.join(import.meta.dirname, "../components/gps-summary/gps-summary.tsx"),
      "utf8",
    );
    assert.ok(statCard.includes("className?"));
    assert.ok(summary.includes("className={styles.kpiTotal}"));
  });
});

describe("GPS vehicle row actions", () => {
  const modulesRoot = path.join(import.meta.dirname, "..");

  it("exposes map and details buttons with distinct handlers", () => {
    const row = readFileSync(
      path.join(modulesRoot, "components/gps-vehicle-row/gps-vehicle-row.tsx"),
      "utf8",
    );
    const screen = readFileSync(
      path.join(modulesRoot, "components/gps-screen/gps-screen.tsx"),
      "utf8",
    );
    assert.ok(row.includes('data-testid="gps-row-show-map"'));
    assert.ok(row.includes('data-testid="gps-row-view-details"'));
    assert.ok(row.includes("onShowOnMap"));
    assert.ok(row.includes("onViewDetails"));
    assert.ok(row.includes("event.stopPropagation()"));
    assert.ok(row.includes("hasMapCoordinates"));
    assert.ok(row.includes("disabled={!canShowOnMap}"));
    assert.ok(screen.includes("openDetail: false"));
    assert.ok(screen.includes("openDetail: true"));
    assert.ok(screen.includes("focusMapVehicle(vehicleId)"));
    assert.ok(screen.includes("scrollIntoView"));
  });
});

describe("GPS detail speed display", () => {
  it("shows real speed only when display motion is moving", () => {
    assert.equal(gpsDetailDisplayedSpeedKph("moving", 72), 72);
    assert.equal(gpsDetailDisplayedSpeedKph("idle", 4), 0);
    assert.equal(gpsDetailDisplayedSpeedKph("parked", 11), 0);
    assert.equal(gpsDetailDisplayedSpeedKph("moving", null), null);
  });

  it("derives drawer speed from display motion in gps-detail", () => {
    const source = readFileSync(
      path.join(import.meta.dirname, "../components/gps-detail/gps-detail.tsx"),
      "utf8",
    );
    assert.ok(
      source.includes("gpsDetailDisplayedSpeedKph(displayMotion, gps?.speedKph)"),
    );
    assert.equal(
      source.includes("formatGpsDetailSpeedValue(gps?.speedKph)"),
      false,
    );
  });
});

describe("GPS detail engine display", () => {
  it("derives engine ON for moving and idle display motion", () => {
    assert.equal(gpsDetailEnginePresentationFromMotion("moving"), "on");
    assert.equal(gpsDetailEnginePresentationFromMotion("idle"), "on");
  });

  it("derives engine OFF for parked display motion", () => {
    assert.equal(gpsDetailEnginePresentationFromMotion("parked"), "off");
  });

  it("does not use raw ignitionOn in the detail drawer", () => {
    const source = readFileSync(
      path.join(import.meta.dirname, "../components/gps-detail/gps-detail.tsx"),
      "utf8",
    );
    assert.ok(source.includes("gpsDetailEnginePresentationFromMotion(displayMotion)"));
    assert.equal(source.includes("gps.ignitionOn"), false);
  });
});

describe("GPS detail provider label", () => {
  const t = (key: "filters.liveGps" | "filters.sevenStars") =>
    key === "filters.liveGps" ? "LIVE MY GPS" : "Seven Stars";

  it("maps vehicle binding providerKey to display labels", () => {
    assert.equal(
      gpsDetailProviderLabel({ assigned: true, providerKey: "LIVE_GPS" }, t),
      "LIVE MY GPS",
    );
    assert.equal(
      gpsDetailProviderLabel({ assigned: true, providerKey: "SEVEN_STARS" }, t),
      "Seven Stars",
    );
    assert.equal(gpsDetailProviderLabel({ assigned: false }, t), "—");
  });

  it("does not read provider from screen list filters", () => {
    const screen = readFileSync(
      path.join(import.meta.dirname, "../components/gps-screen/gps-screen.tsx"),
      "utf8",
    );
    const detail = readFileSync(
      path.join(import.meta.dirname, "../components/gps-detail/gps-detail.tsx"),
      "utf8",
    );
    assert.equal(screen.includes("detailProviderLabel"), false);
    assert.equal(screen.includes("providerLabel={"), false);
    assert.ok(detail.includes("gpsDetailProviderLabel"));
    assert.ok(detail.includes("detail?.binding"));
  });
});

describe("GPS detail compact left drawer", () => {
  const modulesRoot = path.join(import.meta.dirname, "..");

  const forbidden = [
    "receivedAt",
    "accuracyMeters",
    "useGpsHealth",
    "useGpsReports",
    "history.open",
    "mileage.",
    "overspeed.",
    "health.",
    "VehicleImage",
    "VehicleStatus",
    "onViewHistory",
    "onViewContract",
    "detail.receivedAt",
    "deviceModel",
    "externalDevice",
  ];

  it("renders only approved detail fields and blocks technical metadata", () => {
    const source = readFileSync(
      path.join(modulesRoot, "components/gps-detail/gps-detail.tsx"),
      "utf8",
    );
    assert.ok(source.includes("displayMotionStatusFromGpsLocation"));
    assert.ok(source.includes('data-testid="gps-detail-motion-badge"'));
    assert.ok(source.includes("detail.currentSpeed"));
    assert.ok(source.includes("detail.engine"));
    assert.ok(source.includes("detail.currentLocation"));
    assert.ok(source.includes("detail.lastLocationUpdate"));
    assert.ok(source.includes("format.relativeTime(captured"));
    assert.ok(source.includes('anchor="left"'));
    assert.ok(source.includes('width="compact"'));
    assert.ok(source.includes('closePresentation="icon"'));
    assert.ok(source.includes('headerTone="minimal"'));
    assert.equal(source.includes("styles.divider"), false);
    assert.ok(source.includes("ltrIsolate"));
    assert.equal(source.includes("Dialog"), false);
    assert.equal(source.includes("@/shared/components/ui/card"), false);
    for (const token of forbidden) {
      assert.equal(source.includes(token), false, `forbidden token: ${token}`);
    }
  });

  it("uses display motion status labels moving idle parked", () => {
    const source = readFileSync(
      path.join(modulesRoot, "components/gps-detail/gps-detail.tsx"),
      "utf8",
    );
    assert.ok(source.includes('t(`status.${displayMotion}`)'));
    assert.equal(source.includes("gps.trackingStatus"), false);
  });

  it("formats null fallbacks for speed heading coordinates and ignition", () => {
    const present = readFileSync(
      path.join(modulesRoot, "utils/gps-detail-present.ts"),
      "utf8",
    );
    assert.ok(present.includes('GPS_DETAIL_PLACEHOLDER = "—"'));
    assert.equal(formatGpsDetailSpeedValue(null), null);
    assert.equal(formatGpsDetailHeading(null), "—");
    assert.equal(formatGpsDetailCoordinate(null), "—");
    assert.equal(headingCardinalKey(216), "detail.headingCardinal.SW");
  });

  it("opens a left compact drawer via shared Drawer anchor", () => {
    const drawer = readFileSync(
      path.join(import.meta.dirname, "../../../shared/components/ui/drawer/drawer.tsx"),
      "utf8",
    );
    assert.ok(drawer.includes('data-drawer-anchor={anchor}'));
    assert.ok(drawer.includes("panelLeft"));
    const css = readFileSync(
      path.join(import.meta.dirname, "../../../shared/components/ui/drawer/drawer.module.css"),
      "utf8",
    );
    assert.ok(css.includes(".panelLeft"));
    assert.ok(css.includes(".panelCompact"));
    assert.ok(css.includes("width: min(440px"));
    assert.ok(drawer.includes("closeIcon"));
  });

  it("keeps RTL-friendly layout hooks in detail styles", () => {
    const css = readFileSync(
      path.join(modulesRoot, "components/gps-detail/gps-detail.module.css"),
      "utf8",
    );
    assert.ok(css.includes("unicode-bidi: isolate"));
    assert.ok(css.includes("telemetryStrip"));
    assert.equal(css.includes(".divider"), false);
  });
});

describe("GPS map single vehicle focus", () => {
  const modulesRoot = path.join(import.meta.dirname, "..");

  const mapPoint = (vehicleId: number) => ({
    vehicleId,
    company: null,
    latitude: 25.2,
    longitude: 55.27,
    operationalStatus: "available" as const,
    trackingStatus: "moving" as const,
    displayName: `Vehicle ${vehicleId}`,
    plateNumber: null,
    capturedAt: "2026-01-01T00:00:00.000Z",
    speedKph: 40,
    headingDegrees: 90,
    currentRental: null,
  });

  it("focusMapVehicle sets focusedMapVehicleId and map focus token", () => {
    const store = readFileSync(path.join(modulesRoot, "stores/gps.store.ts"), "utf8");
    const focusBlock = store.slice(
      store.indexOf("focusMapVehicle(vehicleId)"),
      store.indexOf("clearMapFocus()"),
    );
    assert.ok(focusBlock.includes("focusedMapVehicleId: vehicleId"));
    assert.ok(focusBlock.includes("mapFocusToken: get().mapFocusToken + 1"));
    const selectBlock = store.slice(
      store.indexOf("selectVehicle(vehicleId"),
      store.indexOf("focusMapVehicle(vehicleId)"),
    );
    assert.equal(selectBlock.includes("mapFocusToken"), false);
  });

  it("focused mode renders only the selected map marker via display filter", () => {
    const points = [mapPoint(1), mapPoint(2), mapPoint(3)];
    const focused = filterMapPointsForFocus(points, 2);
    assert.equal(focused.length, 1);
    assert.equal(focused[0]?.vehicleId, 2);
    const screen = readFileSync(
      path.join(modulesRoot, "components/gps-screen/gps-screen.tsx"),
      "utf8",
    );
    assert.ok(screen.includes("filterMapPointsForFocus"));
    assert.ok(screen.includes("mapRenderPoints"));
  });

  it("show all clears focus without touching query filters", () => {
    const store = readFileSync(path.join(modulesRoot, "stores/gps.store.ts"), "utf8");
    assert.ok(store.includes("clearMapFocus()"));
    assert.ok(store.includes("focusedMapVehicleId: null"));
    const canvas = readFileSync(
      path.join(modulesRoot, "components/gps-map/gps-map-canvas.tsx"),
      "utf8",
    );
    assert.ok(canvas.includes('data-testid="gps-map-show-all"'));
    assert.ok(canvas.includes("onClearMapFocus"));
  });

  it("details selection does not enter map focus mode", () => {
    const store = readFileSync(path.join(modulesRoot, "stores/gps.store.ts"), "utf8");
    const selectBlock = store.slice(
      store.indexOf("selectVehicle(vehicleId"),
      store.indexOf("focusMapVehicle(vehicleId)"),
    );
    assert.equal(selectBlock.includes("focusedMapVehicleId"), false);
    assert.equal(selectBlock.includes("mapFocusToken"), false);
    const screen = readFileSync(
      path.join(modulesRoot, "components/gps-screen/gps-screen.tsx"),
      "utf8",
    );
    assert.ok(
      screen.includes("selectVehicle(vehicleId, { openDetail: true })"),
    );
    const detailsBlock = screen.slice(
      screen.indexOf("viewVehicleDetails = useCallback"),
      screen.indexOf("useEffect(() => {"),
    );
    assert.equal(detailsBlock.includes("focusMapVehicle"), false);
  });

  it("realtime updates do not retrigger map flyTo", () => {
    const store = readFileSync(path.join(modulesRoot, "stores/gps.store.ts"), "utf8");
    const realtime = store.slice(
      store.indexOf("applyRealtimeEvent(event)"),
      store.indexOf("}));"),
    );
    assert.equal(realtime.includes("mapFocusToken"), false);
    const canvas = readFileSync(
      path.join(modulesRoot, "components/gps-map/gps-map-canvas.tsx"),
      "utf8",
    );
    assert.ok(canvas.includes("[focusedMapVehicleId, focusToken]"));
    assert.ok(canvas.includes("GPS_MAP_FOCUS_MIN_ZOOM"));
    assert.equal(GPS_MAP_FOCUS_MIN_ZOOM, 16);
    assert.equal(GPS_MAP_FOCUS_FLY_DURATION_S, 1);
  });

  it("map action stays disabled without valid coordinates", () => {
    const row = readFileSync(
      path.join(modulesRoot, "components/gps-vehicle-row/gps-vehicle-row.tsx"),
      "utf8",
    );
    assert.ok(row.includes("hasMapCoordinates"));
    assert.ok(row.includes("disabled={!canShowOnMap}"));
  });
});

describe("GPS live refresh and vehicle presentation", () => {
  const modulesRoot = path.join(import.meta.dirname, "..");

  it("uses faster visible refresh when LIVE_GPS provider filter is selected", () => {
    const source = readFileSync(path.join(modulesRoot, "hooks/use-gps.ts"), "utf8");
    assert.ok(source.includes("GPS_LIVE_AUTO_REFRESH_INTERVAL_MS = 5_000"));
    assert.ok(source.includes('providerKey === "LIVE_GPS"'));
    assert.ok(source.includes("gpsVisibleRefreshIntervalMs(query.providerKey"));
  });

  it("polls once while mounted, pauses hidden tabs, and cleans up on unmount", () => {
    const source = readFileSync(path.join(modulesRoot, "hooks/use-gps.ts"), "utf8");
    assert.ok(source.includes("GPS_AUTO_REFRESH_INTERVAL_MS = 15_000"));
    assert.ok(source.includes("window.setTimeout"));
    assert.ok(source.includes("document.addEventListener(\"visibilitychange\""));
    assert.ok(source.includes("document.removeEventListener(\"visibilitychange\""));
    assert.ok(source.includes("document.visibilityState === \"hidden\""));
    assert.ok(source.includes("await refresh()"));
  });

  it("refreshes summary, vehicles, and map points through one guarded store refresh", () => {
    const source = readFileSync(path.join(modulesRoot, "stores/gps.store.ts"), "utf8");
    assert.ok(source.includes("let refreshInFlight: Promise<void> | null = null;"));
    assert.ok(source.includes("if (refreshInFlight) return refreshInFlight;"));
    assert.ok(source.includes("loadSummary(set), loadList(get, set), loadMap(get, set)"));
    assert.ok(source.includes("if (summaryInFlight) return summaryInFlight;"));
    assert.ok(source.includes("const requestId = ++listRequestId;"));
    assert.ok(source.includes("if (requestId !== listRequestId) return;"));
    assert.ok(source.includes("const requestId = ++mapRequestId;"));
    assert.ok(source.includes("if (requestId !== mapRequestId) return;"));
    assert.ok(source.includes("providerKey: query.providerKey"));
    assert.ok(source.includes("trackingStatus: query.trackingStatus"));
    assert.ok(source.includes("void Promise.all([loadList(get, set), loadMap(get, set)])"));
  });

  it("does not apply realtime events from another provider to a filtered list", () => {
    const source = readFileSync(path.join(modulesRoot, "stores/gps.store.ts"), "utf8");
    assert.ok(source.includes('state.query.providerKey !== "all"'));
    assert.ok(source.includes('state.query.providerKey !== event.providerKey'));
  });

  it("keeps the last successful data when a refresh request fails", () => {
    const source = readFileSync(path.join(modulesRoot, "stores/gps.store.ts"), "utf8");
    assert.equal(source.includes("summary: null"), true);
    assert.equal(source.includes("vehicles: []"), true);
    assert.equal(source.includes("mapPoints: []"), true);
    assert.equal(source.includes("summaryStatus: \"error\""), true);
    assert.equal(source.includes("listStatus: \"error\""), true);
    assert.equal(source.includes("mapStatus: \"error\""), true);
    assert.equal(source.includes("set({ summary, summaryStatus: \"ready\""), true);
    assert.equal(source.includes("vehicles: result.data"), true);
    assert.equal(source.includes("set({ mapPoints, mapStatus: \"ready\""), true);
  });

  it("uses a neutral localized fallback instead of a missing-plate error label", () => {
    const row = readFileSync(
      path.join(modulesRoot, "components/gps-vehicle-row/gps-vehicle-row.tsx"),
      "utf8",
    );
    const detail = readFileSync(
      path.join(modulesRoot, "components/gps-detail/gps-detail.tsx"),
      "utf8",
    );
    assert.ok(row.includes('vehicle.plateNumber?.trim() || t("gpsVehicle")'));
    assert.ok(detail.includes("plateNumber?.trim()"));
    assert.equal(row.includes('t("noPlate")'), false);
    assert.equal(detail.includes('t("noPlate")'), false);
  });

  it("preserves the vehicle name and supports existing plate numbers", () => {
    const row = readFileSync(
      path.join(modulesRoot, "components/gps-vehicle-row/gps-vehicle-row.tsx"),
      "utf8",
    );
    const detail = readFileSync(
      path.join(modulesRoot, "components/gps-detail/gps-detail.tsx"),
      "utf8",
    );
    assert.ok(row.includes("vehicle.displayName"));
    assert.ok(detail.includes("vehicle.displayName"));
    assert.ok(row.includes("vehicle.plateNumber?.trim()"));
    assert.ok(detail.includes("plateNumber?.trim()"));
  });
});

describe("GPS filters", () => {
  it("exposes tracking filters for server-side queries", () => {
    assert.deepEqual(GPS_TRACKING_FILTERS, [
      "all",
      "moving",
      "idle",
      "parked",
      "online",
      "offline",
      "no_data",
      "unassigned",
    ]);
  });
});

/**
 * GPS company identity is Diamond business metadata read from the Vehicle. It
 * is never persisted in GPS state, never simulated, and never sent to a vendor.
 */
describe("GPS operating company", () => {
  const COMPONENTS = path.join(import.meta.dirname, "../components");

  it("reads the company from the list row vehicle projection", () => {
    const item = vehicle(11, "parked");
    assert.equal(item.vehicle.company.code, "UNIQUE");
    assert.equal(item.vehicle.company.accentColor, "#C9A15C");
  });

  it("shows the shared CompanyIdentity in the list row and the detail drawer", () => {
    for (const file of [
      "gps-vehicle-row/gps-vehicle-row.tsx",
      "gps-detail/gps-detail.tsx",
    ]) {
      const source = readFileSync(path.join(COMPONENTS, file), "utf8");
      assert.ok(
        source.includes("CompanyIdentity"),
        `${file} must render the shared CompanyIdentity`,
      );
      assert.ok(source.includes("vehicle.company"));
    }
  });

  it("offers All Companies / UNIQUE / ELITE from the authoritative store", () => {
    const panel = readFileSync(
      path.join(COMPONENTS, "gps-vehicle-panel/gps-vehicle-panel.tsx"),
      "utf8",
    );
    assert.ok(panel.includes("ALL_COMPANIES"));
    assert.ok(panel.includes("onCompanyFilter"));
    // Options come from the backend company list, never a hardcoded array.
    assert.equal(/\["UNIQUE"/.test(panel), false);
    assert.equal(panel.includes('"ELITE"'), false);

    const screen = readFileSync(
      path.join(COMPONENTS, "gps-screen/gps-screen.tsx"),
      "utf8",
    );
    assert.ok(screen.includes("useOperatingCompanies"));
    assert.equal(screen.includes("apiRequest"), false);
    assert.equal(screen.includes("fetch("), false);
  });

  it("keeps the map markers free of company chrome", () => {
    const canvas = readFileSync(
      path.join(COMPONENTS, "gps-map/gps-map-canvas.tsx"),
      "utf8",
    );
    assert.equal(canvas.includes("CompanyIdentity"), false);
    assert.equal(canvas.includes("company"), false);
  });

  it("never sends the company filter anywhere but the Diamond GPS API", () => {
    const api = readFileSync(path.join(import.meta.dirname, "../api/gps.api.ts"), "utf8");
    assert.ok(api.includes("/gps/vehicles"));
    const simulation = readFileSync(
      path.join(import.meta.dirname, "./gps-simulation.ts"),
      "utf8",
    );
    // A simulated overlay point has no real row behind it, so it has no company.
    assert.ok(simulation.includes("existing?.company ?? null"));
  });
});

describe("GPS map basemap", () => {
  it("defaults to Esri World Imagery satellite tiles without mt0.google.com", () => {
    const satellite = resolveGpsSatelliteBasemap();
    assert.ok(satellite);
    assert.ok(satellite!.url.includes("World_Imagery"));
    assert.equal(satellite!.url.includes("mt0.google.com"), false);
    assert.equal(GPS_MAP_DEFAULT_SATELLITE_TILE_URL.includes("mt0.google.com"), false);
    assert.equal(isGpsSatelliteBasemapEnabled(), true);
  });

  it("defines OSM and satellite tile URLs for Leaflet base layers", () => {
    const basemap = readFileSync(
      path.join(import.meta.dirname, "./gps-map-basemap-config.ts"),
      "utf8",
    );
    const basemapLayer = readFileSync(
      path.join(import.meta.dirname, "./gps-map-basemap.ts"),
      "utf8",
    );
    assert.ok(basemapLayer.includes("createGpsBasemapTileLayer"));
    assert.ok(basemap.includes("tile.openstreetmap.org"));
    assert.ok(basemap.includes("World_Imagery"));
    assert.equal(basemap.includes("imagery/labels/static"), false);
    assert.equal(basemap.includes("SELF_HOSTED"), false);
    assert.equal(basemap.includes("mt0.google.com"), false);
    assert.equal(GPS_MAP_OSM_TILE_URL.includes("openstreetmap"), true);
  });

  it("swaps base tiles without remounting the map or touching vehicle layers", () => {
    const basemapLayer = readFileSync(
      path.join(import.meta.dirname, "./gps-map-basemap.ts"),
      "utf8",
    );
    const canvas = readFileSync(
      path.join(import.meta.dirname, "../components/gps-map/gps-map-canvas.tsx"),
      "utf8",
    );
    assert.ok(canvas.includes("createGpsBasemapTileLayer"));
    assert.ok(canvas.includes("baseTileRef"));
    assert.equal(canvas.includes("baseReferenceTileRef"), false);
    assert.ok(canvas.includes("bringToBack"));
    assert.ok(canvas.includes('data-testid="gps-map-basemap-toggle"'));
    assert.ok(canvas.includes("toggleBasemap"));
    assert.ok(canvas.includes("styles.controls"));
    assert.equal(canvas.includes("basemapToggle"), false);
    assert.ok(canvas.includes("map.removeLayer(previousBase)"));
    assert.equal(basemapLayer.includes("resolveGpsSatelliteLabelsBasemap"), false);
    assert.ok(canvas.includes("map.setView(center, zoom, { animate: false })"));
    assert.equal(canvas.includes("fitBounds"), true);
    assert.ok(gpsMapBasemapAttributionLabel("map").includes("OpenStreetMap"));
    assert.ok(
      gpsMapBasemapAttributionLabel("satellite").includes(
        GPS_MAP_DEFAULT_SATELLITE_ATTRIBUTION.split(",")[0]!,
      ),
    );
  });

});
