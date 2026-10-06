/**
 * Gemini identity document extraction diagnostic (server-only).
 *
 * Usage:
 *   npm run test:gemini-document -- --type passport --file "PATH"
 *   npm run test:gemini-document -- --type licence --file "PATH"
 */
import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import path from "node:path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

function usage(): never {
  console.error("Usage: npm run test:gemini-document -- --type passport|licence --file <path>");
  process.exit(1);
}

function parseArgs(argv: string[]): { type: "passport" | "licence"; file: string } {
  let type: string | undefined;
  let file: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--type") type = argv[++i];
    if (argv[i] === "--file") file = argv[++i];
  }
  if ((type !== "passport" && type !== "licence") || !file?.trim()) usage();
  return { type, file: path.resolve(file) };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { env } = await import("src/config/env");
  const { createVisionAIProvider } = await import("src/modules/vision-ai/vision-ai-provider.factory");

  if (env.AI_VISION_PROVIDER !== "gemini") {
    console.error("Set AI_VISION_PROVIDER=gemini in APP/backend/.env");
    process.exit(1);
  }
  if (!env.GEMINI_API_KEY.trim()) {
    console.error("GEMINI_API_KEY is missing in APP/backend/.env");
    process.exit(1);
  }

  const bytes = await readFile(args.file);
  const ext = path.extname(args.file).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "";
  if (!mimeType) {
    console.error("Only .png, .jpg, and .jpeg files are supported");
    process.exit(1);
  }

  const provider = createVisionAIProvider();
  const result =
    args.type === "passport"
      ? await provider.extractPassport({ bytes, mimeType })
      : await provider.extractDrivingLicence({ bytes, mimeType });

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Gemini document test failed: ${message}`);
  process.exit(1);
});
