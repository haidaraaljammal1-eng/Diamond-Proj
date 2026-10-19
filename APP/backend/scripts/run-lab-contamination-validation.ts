/**
 * Lab-only: protected GPS/WhatsApp manifest → contamination cleanup → manifest compare.
 */
import { execSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { extractPostgresDatabaseName } from "../src/lib/db/integration-database-guard";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const labUrl = process.env.LAB_DATABASE_URL?.trim() ?? "";
const dbName = labUrl ? extractPostgresDatabaseName(labUrl) : "";
if (!labUrl || dbName !== "haidara_contamination_lab") {
  console.error("Set LAB_DATABASE_URL to haidara_contamination_lab");
  process.exit(1);
}

const backupPath = process.argv[2];
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupsDir = path.resolve(__dirname, "../backups");
const beforePath = path.join(backupsDir, `integrity-manifest-lab-before-${stamp}.json`);
const afterPath = path.join(backupsDir, `integrity-manifest-lab-after-${stamp}.json`);

function runManifest(outFile: string) {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      path.join(__dirname, "protected-data-integrity-manifest.ts"),
      outFile,
    ],
    {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, LAB_DATABASE_URL: labUrl, MANIFEST_DATABASE_URL: labUrl },
      stdio: "inherit",
    },
  );
  if (result.status !== 0) {
    throw new Error(`integrity manifest failed (exit ${result.status})`);
  }
}

function digestFile(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function compareManifests(before: Record<string, unknown>, after: Record<string, unknown>) {
  const gpsEqual =
    JSON.stringify(before.gps) === JSON.stringify(after.gps) &&
    (before.gps as { trackedVehicleIds: number[] }).trackedVehicleIds.join() ===
      (after.gps as { trackedVehicleIds: number[] }).trackedVehicleIds.join();
  const waEqual = JSON.stringify(before.whatsapp) === JSON.stringify(after.whatsapp);
  return { gpsEqual, waEqual };
}

async function main() {
  if (backupPath) {
    const provision = spawnSync(
      process.execPath,
      ["--import", "tsx", path.join(__dirname, "provision-contamination-lab.ts"), backupPath],
      { cwd: path.resolve(__dirname, ".."), stdio: "inherit" },
    );
    if (provision.status !== 0) {
      throw new Error("provision-contamination-lab failed");
    }
  }

  runManifest(beforePath);
  const before = JSON.parse(fs.readFileSync(beforePath, "utf8")) as Record<string, unknown>;

  const cleanup = spawnSync(
    process.execPath,
    ["--import", "tsx", path.join(__dirname, "contamination-cleanup-lab.ts")],
    {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, LAB_DATABASE_URL: labUrl },
      stdio: "inherit",
    },
  );
  if (cleanup.status !== 0) {
    throw new Error("contamination-cleanup-lab failed");
  }

  runManifest(afterPath);
  const after = JSON.parse(fs.readFileSync(afterPath, "utf8")) as Record<string, unknown>;
  const { gpsEqual, waEqual } = compareManifests(before, after);

  const verdict =
    gpsEqual && waEqual ? "COMPLETE_CLEANUP_READY_FOR_APPROVAL" : "BLOCKED_GPS_OR_WHATSAPP_DRIFT";

  const report = {
    verdict,
    gpsIntegrity: gpsEqual ? "UNCHANGED" : "DRIFT_DETECTED",
    whatsappIntegrity: waEqual ? "UNCHANGED" : "DRIFT_DETECTED",
    beforeManifest: beforePath,
    afterManifest: afterPath,
    beforeFileDigest: digestFile(beforePath),
    afterFileDigest: digestFile(afterPath),
    trackedVehiclesBefore: (before.gps as { trackedVehicleCount: number }).trackedVehicleCount,
    trackedVehiclesAfter: (after.gps as { trackedVehicleCount: number }).trackedVehicleCount,
    blkwidBefore: (before.whatsapp as { blkwid: unknown }).blkwid,
    blkwidAfter: (after.whatsapp as { blkwid: unknown }).blkwid,
  };

  const reportPath = path.join(backupsDir, `lab-validation-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!gpsEqual || !waEqual) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
