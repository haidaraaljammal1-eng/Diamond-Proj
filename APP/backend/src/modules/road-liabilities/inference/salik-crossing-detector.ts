import type { RoadLiabilityConfidence } from "@prisma/client";
import type { GpsAcceptedPoint } from "src/modules/gps/gps.types";

const EARTH_RADIUS_M = 6_371_000;

export interface GateGeometry {
  id: string;
  nameEn: string;
  nameAr: string;
  lineStartLatitude: number;
  lineStartLongitude: number;
  lineEndLatitude: number;
  lineEndLongitude: number;
  corridorMeters: number;
  allowedHeadingDegrees: number | null;
  headingToleranceDegrees: number | null;
}

export interface CrossingDetection {
  gateId: string;
  locationLabel: string;
  occurredAt: Date;
  confidence: RoadLiabilityConfidence;
}

type XY = { x: number; y: number };

function toXY(lat: number, lng: number, originLat: number, originLng: number): XY {
  const originLatRad = (originLat * Math.PI) / 180;
  return {
    x: ((lng - originLng) * Math.PI * Math.cos(originLatRad) * EARTH_RADIUS_M) / 180,
    y: ((lat - originLat) * Math.PI * EARTH_RADIUS_M) / 180,
  };
}

function hypot(a: XY, b: XY): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function headingDegrees(from: XY, to: XY): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let deg = (Math.atan2(dx, dy) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

function headingDelta(actual: number, allowed: number): number {
  let diff = Math.abs(actual - allowed) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

function headingCompatible(gate: GateGeometry, from: XY, to: XY): boolean {
  if (gate.allowedHeadingDegrees == null) return true;
  const tolerance = gate.headingToleranceDegrees ?? 45;
  return headingDelta(headingDegrees(from, to), gate.allowedHeadingDegrees) <= tolerance;
}

function signedDistance(p: XY, a: XY, b: XY): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len = Math.hypot(abx, aby);
  if (len < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  return ((p.x - a.x) * aby - (p.y - a.y) * abx) / len;
}

function movementGateIntersectionT(c: XY, d: XY, a: XY, b: XY): number | null {
  const rdx = d.x - c.x;
  const rdy = d.y - c.y;
  const sdx = b.x - a.x;
  const sdy = b.y - a.y;
  const denom = rdx * sdy - rdy * sdx;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((a.x - c.x) * sdy - (a.y - c.y) * sdx) / denom;
  const u = ((a.x - c.x) * rdy - (a.y - c.y) * rdx) / denom;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return Math.min(1, Math.max(0, t));
}

function projectParam(p: XY, a: XY, b: XY): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-12) return 0;
  return ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
}

function interpolateTime(previous: Date, current: Date, t: number): Date {
  return new Date(previous.getTime() + t * (current.getTime() - previous.getTime()));
}

/**
 * Detect whether the movement segment previous→current crossed a gate line
 * (or its corridor). Radius-only proximity is never sufficient.
 *
 * Direction is applied only when the gate has verified heading metadata.
 */
export function detectGateCrossing(
  previous: GpsAcceptedPoint,
  current: GpsAcceptedPoint,
  gate: GateGeometry,
): CrossingDetection | null {
  const originLat = (gate.lineStartLatitude + gate.lineEndLatitude) / 2;
  const originLng = (gate.lineStartLongitude + gate.lineEndLongitude) / 2;
  const a = toXY(gate.lineStartLatitude, gate.lineStartLongitude, originLat, originLng);
  const b = toXY(gate.lineEndLatitude, gate.lineEndLongitude, originLat, originLng);
  const c = toXY(previous.latitude, previous.longitude, originLat, originLng);
  const d = toXY(current.latitude, current.longitude, originLat, originLng);

  if (hypot(c, d) < 0.5) return null;
  if (!headingCompatible(gate, c, d)) return null;

  const corridor = Math.max(0, gate.corridorMeters);
  const exactT = movementGateIntersectionT(c, d, a, b);
  if (exactT != null) {
    return {
      gateId: gate.id,
      locationLabel: gate.nameEn,
      occurredAt: interpolateTime(previous.capturedAt, current.capturedAt, exactT),
      confidence: "HIGH",
    };
  }

  const distPrev = signedDistance(c, a, b);
  const distCurr = signedDistance(d, a, b);
  const crossedInfiniteLine = distPrev === 0 || distCurr === 0 || distPrev * distCurr < 0;
  if (!crossedInfiniteLine) return null;

  const absPrev = Math.abs(distPrev);
  const absCurr = Math.abs(distCurr);
  const denom = absPrev + absCurr;
  const t = denom > 0 ? absPrev / denom : 0.5;
  const crossing = {
    x: c.x + t * (d.x - c.x),
    y: c.y + t * (d.y - c.y),
  };
  const u = projectParam(crossing, a, b);
  if (u < -0.05 || u > 1.05) return null;
  if (Math.abs(signedDistance(crossing, a, b)) > corridor) return null;

  return {
    gateId: gate.id,
    locationLabel: gate.nameEn,
    occurredAt: interpolateTime(previous.capturedAt, current.capturedAt, t),
    confidence: absPrev <= corridor && absCurr <= corridor ? "LOW" : "MEDIUM",
  };
}

export function detectFirstCrossing(
  previous: GpsAcceptedPoint,
  current: GpsAcceptedPoint,
  gates: GateGeometry[],
): CrossingDetection | null {
  const hits: CrossingDetection[] = [];
  for (const gate of gates) {
    const hit = detectGateCrossing(previous, current, gate);
    if (hit) hits.push(hit);
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  return hits[0]!;
}
