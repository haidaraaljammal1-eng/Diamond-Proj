import test from "node:test";
import assert from "node:assert/strict";
import {
  mapLiveGpsMileageSummary,
  mapLiveGpsOverspeedRows,
} from "src/modules/gps/providers/live-gps/live-gps.reports";

test("maps LIVE_GPS mileage summary KM values", () => {
  assert.deepEqual(
    mapLiveGpsMileageSummary([
      {
        today_driven: "51.88 KM",
        yesterday: "12 KM",
        this_month: "400.5 KM",
        last_month: "0 KM",
      },
    ]),
    { todayKm: 51.88, yesterdayKm: 12, thisMonthKm: 400.5, lastMonthKm: 0 },
  );
});

test("rejects malformed LIVE_GPS mileage summary", () => {
  assert.throws(() =>
    mapLiveGpsMileageSummary([
      { today_driven: "not available", yesterday: "1 KM", this_month: "2 KM", last_month: "3 KM" },
    ]),
  );
});

test("maps overspeed rows with explicit provider timezone", () => {
  const result = mapLiveGpsOverspeedRows(
    [
      {
        from_time: "09:10:00",
        to_time: "09:25:00",
        average_speed: "84",
        top_speed: "101",
        totalmin: "15",
        start_address: "Start",
        end_address: "End",
      },
    ],
    "2026-10-09",
    "+04:00",
  );

  assert.equal(result.invalidRowCount, 0);
  assert.equal(result.events[0]?.startedAt.toISOString(), "2026-10-09T05:10:00.000Z");
  assert.equal(result.events[0]?.endedAt.toISOString(), "2026-10-09T05:25:00.000Z");
  assert.equal(result.events[0]?.maxSpeedKph, 101);
  assert.equal(result.events[0]?.addressLine, "End");
});

test("counts malformed overspeed rows without fabricating events", () => {
  const result = mapLiveGpsOverspeedRows(
    [{ from_time: "invalid", top_speed: "90" }, null],
    "2026-10-09",
    "+04:00",
  );

  assert.deepEqual(result, { events: [], invalidRowCount: 2 });
});

test("rejects invalid report dates and times", () => {
  assert.deepEqual(
    mapLiveGpsOverspeedRows(
      [
        {
          from_time: "09:10:00",
          to_time: "09:25:00",
          average_speed: "84",
          top_speed: "101",
          totalmin: "15",
        },
      ],
      "2026-02-30",
      "+04:00",
    ),
    { events: [], invalidRowCount: 1 },
  );
  assert.deepEqual(
    mapLiveGpsOverspeedRows(
      [
        {
          from_time: "25:10:00",
          to_time: "09:25:00",
          average_speed: "84",
          top_speed: "101",
          totalmin: "15",
        },
      ],
      "2026-10-09",
      "+04:00",
    ),
    { events: [], invalidRowCount: 1 },
  );
});

test("keeps provider date for a crossing-midnight row without guessing a next date", () => {
  const result = mapLiveGpsOverspeedRows(
    [
      {
        from_time: "23:55:00",
        to_time: "00:05:00",
        average_speed: "84",
        top_speed: "101",
        totalmin: "10",
      },
    ],
    "2026-10-09",
    "+04:00",
  );

  assert.equal(result.invalidRowCount, 0);
  assert.equal(result.events[0]?.startedAt.toISOString(), "2026-10-09T19:55:00.000Z");
  assert.equal(result.events[0]?.endedAt.toISOString(), "2026-10-08T20:05:00.000Z");
});
