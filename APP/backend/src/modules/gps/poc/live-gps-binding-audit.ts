import { normalizePlateNumber } from "src/lib/master-data/code";
import { resolveVehiclePlateFields } from "src/modules/vehicles/vehicle-plate";
import { asString, isRecord } from "src/modules/gps/providers/live-gps/live-gps.parse";

export type MatchCategory = "EXACT" | "LIKELY" | "AMBIGUOUS" | "NO_MATCH";

export type EliteVehicleCandidate = {
  id: number;
  vehicleLabel: string;
  plateDisplay: string;
  plateCode: string | null;
  plateNumber: string | null;
  plateNormalized: string | null;
  isActive: boolean;
};

export type ProviderDeviceRow = {
  row: number;
  externalDeviceId: string;
  providerVehicleLabel: string;
  deviceType: string | null;
};

export type BindingAuditRow = {
  providerRow: number;
  externalDeviceId: string;
  providerVehicleLabel: string;
  diamondVehicleId: number | null;
  diamondVehicle: string | null;
  diamondPlate: string | null;
  matchCategory: MatchCategory;
  matchEvidence: string;
  operatorConfirmationRequired: boolean;
};

function plateKey(code: string | null, number: string | null): string | null {
  if (!number) return null;
  const n = normalizePlateNumber(number);
  if (code) return `${normalizePlateNumber(code)}|${n}`;
  return n;
}

function extractProviderPlateCandidates(
  label: string,
): Array<{ plateCode: string | null; plateNumber: string }> {
  const normalized = normalizePlateNumber(label);
  const out: Array<{ plateCode: string | null; plateNumber: string }> = [];
  const seen = new Set<string>();

  const push = (plateCode: string | null, plateNumber: string) => {
    const n = normalizePlateNumber(plateNumber);
    if (!n) return;
    const key = `${plateCode ?? ""}|${n}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ plateCode, plateNumber: n });
  };

  for (const m of label.matchAll(/#\s*(\d+)/g)) {
    push(null, m[1]!);
  }

  const dxbRe = /(?:DXB|DUBAI)\s+([A-Z])\s*(\d+)/gi;
  for (const m of normalized.matchAll(dxbRe)) {
    push(m[1]!.toUpperCase(), m[2]!);
  }

  const tokens = normalized.split(/\s+/);
  const last = tokens[tokens.length - 1] ?? "";
  const compact = /^([A-Z])(\d{3,6})$/.exec(last.replace(/\s/g, ""));
  if (compact) {
    push(compact[1]!, compact[2]!);
  }

  const resolved = resolveVehiclePlateFields({ plateNumber: normalized });
  if (resolved.plateNumber) {
    push(resolved.plateCode, resolved.plateNumber);
  }

  return out;
}

function vehicleLabel(v: EliteVehicleCandidate): string {
  return v.vehicleLabel;
}

function formatPlateDisplay(v: EliteVehicleCandidate): string {
  if (v.plateCode && v.plateNumber) return `${v.plateCode} ${v.plateNumber}`;
  return v.plateNormalized ?? "—";
}

type Scored = { vehicle: EliteVehicleCandidate; category: MatchCategory; evidence: string };

function scoreDeviceAgainstFleet(
  provider: ProviderDeviceRow,
  fleet: EliteVehicleCandidate[],
): Scored[] {
  const labelUpper = normalizePlateNumber(provider.providerVehicleLabel);
  const candidates = extractProviderPlateCandidates(provider.providerVehicleLabel);
  const hits: Scored[] = [];
  const hitVehicleIds = new Set<number>();

  const addHit = (hit: Scored) => {
    if (hitVehicleIds.has(hit.vehicle.id)) return;
    hitVehicleIds.add(hit.vehicle.id);
    hits.push(hit);
  };

  for (const v of fleet) {
    const vKey = plateKey(v.plateCode, v.plateNumber);
    const vNorm = v.plateNormalized;
    const vNumber = v.plateNumber ? normalizePlateNumber(v.plateNumber) : null;

    for (const c of candidates) {
      const providerKey = plateKey(c.plateCode, c.plateNumber);
      if (providerKey && vKey && providerKey === vKey) {
        addHit({
          vehicle: v,
          category: "EXACT",
          evidence: `Plate code+number match (${formatPlateDisplay(v)})`,
        });
        continue;
      }

      const cNum = normalizePlateNumber(c.plateNumber);
      if (cNum && vNumber && cNum === vNumber) {
        const codeMatch =
          c.plateCode &&
          v.plateCode &&
          normalizePlateNumber(c.plateCode) === normalizePlateNumber(v.plateCode);
        addHit({
          vehicle: v,
          category: codeMatch ? "EXACT" : "LIKELY",
          evidence: codeMatch
            ? `Plate number + code match`
            : `Plate number ${cNum} matches; code differs or missing on one side`,
        });
      }

      if (vNorm && labelUpper.includes(vNorm)) {
        addHit({
          vehicle: v,
          category: "EXACT",
          evidence: `Provider label contains Diamond plate text (${vNorm})`,
        });
      }
    }

    const nameTokens = v.vehicleLabel.toUpperCase().split(/\s+/).filter((t) => t.length > 2);
    const nameInLabel =
      nameTokens.length > 0 && nameTokens.some((t) => labelUpper.includes(t));
    if (nameInLabel && candidates.some((c) => vNumber?.includes(c.plateNumber))) {
      addHit({
        vehicle: v,
        category: "LIKELY",
        evidence: `Vehicle label token + plate number overlap`,
      });
    }
  }

  return hits;
}

export function auditProviderDevices(
  devices: ProviderDeviceRow[],
  eliteFleet: EliteVehicleCandidate[],
): BindingAuditRow[] {
  return devices.map((provider) => {
    const hits = scoreDeviceAgainstFleet(provider, eliteFleet);
    const exact = hits.filter((h) => h.category === "EXACT");
    const likely = hits.filter((h) => h.category === "LIKELY");

    if (exact.length === 1) {
      const h = exact[0]!;
      return {
        providerRow: provider.row,
        externalDeviceId: provider.externalDeviceId,
        providerVehicleLabel: provider.providerVehicleLabel,
        diamondVehicleId: h.vehicle.id,
        diamondVehicle: vehicleLabel(h.vehicle),
        diamondPlate: formatPlateDisplay(h.vehicle),
        matchCategory: "EXACT",
        matchEvidence: h.evidence,
        operatorConfirmationRequired: true,
      };
    }

    if (exact.length > 1) {
      return {
        providerRow: provider.row,
        externalDeviceId: provider.externalDeviceId,
        providerVehicleLabel: provider.providerVehicleLabel,
        diamondVehicleId: null,
        diamondVehicle: exact.map((h) => `#${h.vehicle.id} ${vehicleLabel(h.vehicle)}`).join("; "),
        diamondPlate: exact.map((h) => formatPlateDisplay(h.vehicle)).join("; "),
        matchCategory: "AMBIGUOUS",
        matchEvidence: `Multiple EXACT candidates: ${exact.map((h) => h.vehicle.id).join(", ")}`,
        operatorConfirmationRequired: true,
      };
    }

    if (likely.length === 1) {
      const h = likely[0]!;
      return {
        providerRow: provider.row,
        externalDeviceId: provider.externalDeviceId,
        providerVehicleLabel: provider.providerVehicleLabel,
        diamondVehicleId: h.vehicle.id,
        diamondVehicle: vehicleLabel(h.vehicle),
        diamondPlate: formatPlateDisplay(h.vehicle),
        matchCategory: "LIKELY",
        matchEvidence: h.evidence,
        operatorConfirmationRequired: true,
      };
    }

    if (likely.length > 1) {
      return {
        providerRow: provider.row,
        externalDeviceId: provider.externalDeviceId,
        providerVehicleLabel: provider.providerVehicleLabel,
        diamondVehicleId: null,
        diamondVehicle: likely.map((h) => `#${h.vehicle.id} ${vehicleLabel(h.vehicle)}`).join("; "),
        diamondPlate: likely.map((h) => formatPlateDisplay(h.vehicle)).join("; "),
        matchCategory: "AMBIGUOUS",
        matchEvidence: `Multiple LIKELY candidates: ${likely.map((h) => h.vehicle.id).join(", ")}`,
        operatorConfirmationRequired: true,
      };
    }

    return {
      providerRow: provider.row,
      externalDeviceId: provider.externalDeviceId,
      providerVehicleLabel: provider.providerVehicleLabel,
      diamondVehicleId: null,
      diamondVehicle: null,
      diamondPlate: null,
      matchCategory: "NO_MATCH",
      matchEvidence: "No credible ELITE plate or label match",
      operatorConfirmationRequired: true,
    };
  });
}

export function extractProviderDevicesFromFleetRows(rows: unknown[]): ProviderDeviceRow[] {
  const devices: ProviderDeviceRow[] = [];
  rows.forEach((row, index) => {
    if (!isRecord(row)) return;
    const id = asString(row.deviceid);
    if (!id) return;
    devices.push({
      row: index + 1,
      externalDeviceId: id,
      providerVehicleLabel: asString(row.vehicleno) ?? asString(row.vehicletypename) ?? "",
      deviceType: asString(row.devicetype),
    });
  });
  return devices;
}

export function toEliteVehicleCandidate(
  v: {
    id: number;
    vehicleName: string | null;
    plateNumber: string | null;
    isActive: boolean;
    model: { name: string } | null;
  },
): EliteVehicleCandidate {
  const resolved = resolveVehiclePlateFields({ plateNumber: v.plateNumber });
  const label =
    v.vehicleName?.trim() ||
    v.model?.name?.trim() ||
    `Vehicle #${v.id}`;
  return {
    id: v.id,
    vehicleLabel: label,
    plateDisplay: resolved.plateCode && resolved.plateNumber
      ? `${resolved.plateCode} ${resolved.plateNumber}`
      : v.plateNumber
        ? normalizePlateNumber(v.plateNumber)
        : "—",
    plateCode: resolved.plateCode,
    plateNumber: resolved.plateNumber,
    plateNormalized: v.plateNumber ? normalizePlateNumber(v.plateNumber) : null,
    isActive: v.isActive,
  };
}

export function collisionCheck(rows: BindingAuditRow[]): {
  duplicateProviderDeviceProposals: string[];
  duplicateDiamondVehicleProposals: number[];
  crossCompanyCandidates: boolean;
  existingBindingConflicts: string[];
} {
  const deviceIds = rows.map((r) => r.externalDeviceId);
  const dupDevices = deviceIds.filter((id, i) => deviceIds.indexOf(id) !== i);

  const vehicleIds = rows
    .map((r) => r.diamondVehicleId)
    .filter((id): id is number => id != null);
  const dupVehicles = vehicleIds.filter((id, i) => vehicleIds.indexOf(id) !== i);

  return {
    duplicateProviderDeviceProposals: [...new Set(dupDevices)],
    duplicateDiamondVehicleProposals: [...new Set(dupVehicles)],
    crossCompanyCandidates: false,
    existingBindingConflicts: [],
  };
}
