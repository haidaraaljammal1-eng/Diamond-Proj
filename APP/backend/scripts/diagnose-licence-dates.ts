/**
 * Local diagnostic only — not part of production API.
 * Compares raw Gemini JSON vs parseGeminiLicenceRaw for licence date fields.
 */
import dotenv from "dotenv";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DATE_ONLY_SCHEMA = {
  type: "object",
  properties: {
    dateOfBirth: { type: "string", nullable: true },
    issueDate: { type: "string", nullable: true },
    expiryDate: { type: "string", nullable: true },
  },
  additionalProperties: false,
} as const;

const DATE_PROMPT = `Identify these visible labelled fields exactly as printed:
- Date of Birth
- Issue Date
- Expiry Date
Return JSON only with keys dateOfBirth, issueDate, expiryDate.
Do not infer. Do not swap dates. null only if genuinely unreadable.`;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const { env } = await import("src/config/env");
  const { GEMINI_LICENCE_JSON_SCHEMA, parseGeminiLicenceRaw } = await import(
    "src/modules/vision-ai/extraction/licence-gemini.schema"
  );
  const { GEMINI_LICENCE_SYSTEM_INSTRUCTION } = await import("src/modules/vision-ai/vision-ai.constants");
  const { geminiGenerateStructuredJson } = await import("src/modules/vision-ai/gemini/gemini-structured.client");

  const apiKey = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL;
  if (!apiKey.trim()) {
    console.error("GEMINI_API_KEY missing");
    process.exit(1);
  }

  const fileArg = process.argv[2];
  const files = fileArg
    ? [[path.basename(fileArg), path.resolve(fileArg)]]
    : [
        ["L1", "C:/Users/Rw/OCR TEST/samples/licence/image.png"],
        ["L3", "C:/Users/Rw/OCR TEST/samples/licence/uae_licence_marlon_dubai.png"],
      ];

  const out: unknown[] = [];
  for (const [id, file] of files) {
    await sleep(10000);
    const bytes = await readFile(file);
    const fullRaw = (await geminiGenerateStructuredJson({
      apiKey,
      model,
      systemInstruction: GEMINI_LICENCE_SYSTEM_INSTRUCTION,
      responseJsonSchema: GEMINI_LICENCE_JSON_SCHEMA as Record<string, unknown>,
      mimeType: "image/png",
      imageBytes: bytes,
      userPrompt: "Extract driving licence fields from this image.",
    })) as Record<string, unknown>;

    let parsed: unknown;
    try {
      parsed = parseGeminiLicenceRaw(fullRaw);
    } catch (e) {
      parsed = { parseError: e instanceof Error ? e.message : String(e) };
    }

    await sleep(10000);
    const dateRaw = await geminiGenerateStructuredJson({
      apiKey,
      model,
      systemInstruction: DATE_PROMPT,
      responseJsonSchema: DATE_ONLY_SCHEMA as Record<string, unknown>,
      mimeType: "image/png",
      imageBytes: bytes,
      userPrompt: "Read the three date fields from this driving licence image.",
    });

    const row = {
      id,
      fullRawDates: {
        dob: fullRaw.dateOfBirth,
        issue: fullRaw.issueDate,
        exp: fullRaw.expiryDate,
      },
      afterParse: parsed,
      dateOnlyRaw: dateRaw,
    };
    out.push(row);
    console.log(JSON.stringify(row));
  }

  const outPath = path.join(process.env.TEMP ?? "/tmp", "gemini-licence-diagnose.json");
  await writeFile(outPath, JSON.stringify(out, null, 2));
  console.error(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
