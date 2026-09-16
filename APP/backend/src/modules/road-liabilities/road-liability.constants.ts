/**
 * Road liabilities constants. Diamond-owned names — not a vendor API contract.
 */

export const ROAD_LIABILITY_SOURCE_KEYS = ["RTA", "SALIK", "GPS_INFERENCE", "TARS"] as const;
export type RoadLiabilitySourceKey = (typeof ROAD_LIABILITY_SOURCE_KEYS)[number];

export const ROAD_LIABILITY_INGEST_LOCK_NS = "road_liability_ingest";
export const ROAD_LIABILITY_GPS_LOCK_NS = "road_liability_gps";

/** GPS jitter window for duplicate predicted crossings of the same physical gate. Not a Salik billing rule. */
export const GPS_CROSSING_DEDUP_MS = 120_000;

/** Max elapsed time between a GPS prediction and an official Salik event to link them. */
export const AUTHORITATIVE_PREDICTION_MATCH_MS = 30 * 60 * 1000;

export const ROAD_LIABILITY_OUTBOX_EVENT = "road_liability.chargeable";
export const ROAD_LIABILITY_OUTBOX_AGGREGATE = "RoadLiability";

export const TOLL_NETWORK_SALIK = "SALIK";
