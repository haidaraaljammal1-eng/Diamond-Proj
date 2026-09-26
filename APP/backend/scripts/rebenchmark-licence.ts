/**
 * Sequential licence re-benchmark (local). Writes summary to %TEMP%; no PII in stdout.
 */
import dotenv from "dotenv";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { geminiExtractDrivingLicence } from "src/modules/vision-ai/gemini/gemini-licence.extract";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SAMPLES: [string, string][] = [
  ["L1", "C:/Users/Rw/OCR TEST/samples/licence/image.png"],
  ["L2", "C:/Users/Rw/OCR TEST/samples/licence/uae_licence_manal_dubai.png"],
  ["L3", "C:/Users/Rw/OCR TEST/samples/licence/uae_licence_marlon_dubai.png"],
  ["L4", "C:/Users/Rw/OCR TEST/samples/licence/uae_licence_marlon_dubai_hq.png"],
  ["L5", "C:/Users/Rw/OCR TEST/samples/licence/uae_licence_sample_ali_jabri.png"],
];

const DELAY_MS = 12_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isQuotaError(message: string): boolean {
  return message.includes("429") || message.includes("RESOURCE_EXHAUSTED") || message.includes("503");
}

async function extractOnce(apiKey: string, model: string, file: string) {
  const bytes = await readFile(file);
  return geminiExtractDrivingLicence({ bytes, mimeType: "image/png" }, { apiKey, model });
}

async function main(): Promise<void> {
  const { env } = await import("src/config/env");
  const apiKey = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL;
  if (!apiKey.trim()) {
    console.error("GEMINI_API_KEY missing");
    process.exit(1);
  }

  const stats = { r429: 0, r503: 0, retries: 0 };
  const rows: unknown[] = [];

  for (const [id, file] of SAMPLES) {
    await sleep(DELAY_MS);
    let result = await extractOnce(apiKey, model, file);
    if (!result.ok && isQuotaError(result.message)) {
      if (result.message.includes("429")) stats.r429++;
      if (result.message.includes("503")) stats.r503++;
      const waitMatch = /retry in ([\d.]+)s/i.exec(result.message);
      const waitMs = waitMatch ? Math.ceil(Number(waitMatch[1]) * 1000) + 2000 : 45_000;
      await sleep(waitMs);
      stats.retries++;
      result = await extractOnce(apiKey, model, file);
      if (!result.ok && isQuotaError(result.message)) {
        if (result.message.includes("429")) stats.r429++;
        if (result.message.includes("503")) stats.r503++;
      }
    }

    if (!result.ok) {
      rows.push({ id, providerUnavailable: true, code: result.code });
      console.log(JSON.stringify({ id, status: "PROVIDER_UNAVAILABLE" }));
      continue;
    }

    const f = result.extraction.fields;
    rows.push({
      id,
      licenceNumber: f.licenceNumber?.status,
      dob: f.dateOfBirth?.status,
      issue: f.issueDate?.status,
      expiry: f.expiryDate?.status,
      hasValues: {
        licenceNumber: Boolean(f.licenceNumber?.value),
        dob: Boolean(f.dateOfBirth?.value),
        issue: Boolean(f.issueDate?.value),
        expiry: Boolean(f.expiryDate?.value),
      },
    });
    console.log(
      JSON.stringify({
        id,
        licenceNumber: f.licenceNumber?.status,
        dob: f.dateOfBirth?.status,
        issue: f.issueDate?.status,
        expiry: f.expiryDate?.status,
      }),
    );
  }

  const outPath = path.join(process.env.TEMP ?? "/tmp", "gemini-licence-rebenchmark.json");
  await writeFile(outPath, JSON.stringify({ stats, rows }, null, 2));
  console.error(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
