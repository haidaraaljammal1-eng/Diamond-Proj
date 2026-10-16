import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { env } from "src/config/env";
import { sniffWhatsAppMedia } from "src/modules/whatsapp/whatsapp.media";
import { whatsappError } from "src/modules/whatsapp/whatsapp.errors";
import { WHAPI_MEDIA_MAX_BYTES } from "src/modules/whatsapp/whapi.config";

const VOICE_TIMEOUT_MS = 20_000;
const MAX_VOICE_BYTES = WHAPI_MEDIA_MAX_BYTES.AUDIO;
const MAX_CONCURRENT_CONVERSIONS = 2;
const MAX_QUEUED_CONVERSIONS = 4;

let activeConversions = 0;
const conversionWaiters: Array<() => void> = [];

/**
 * Absolute ffmpeg path when set. Otherwise the process PATH is used.
 * ffmpeg is spawned only for a conversion and exits when that conversion ends.
 */
export function resolveFfmpegExecutable(): string {
  const configured = env.WHATSAPP_FFMPEG_PATH.trim();
  return configured.length > 0 ? configured : "ffmpeg";
}

function acquireConversion(): Promise<void> {
  if (activeConversions < MAX_CONCURRENT_CONVERSIONS) {
    activeConversions += 1;
    return Promise.resolve();
  }
  if (conversionWaiters.length >= MAX_QUEUED_CONVERSIONS) {
    return Promise.reject(whatsappError.voiceUnsupported());
  }
  return new Promise((resolve) => {
    conversionWaiters.push(() => {
      activeConversions += 1;
      resolve();
    });
  });
}

function releaseConversion(): void {
  activeConversions = Math.max(0, activeConversions - 1);
  const next = conversionWaiters.shift();
  if (next) next();
}

function isWebm(bytes: Buffer): boolean {
  return bytes.length > 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
}

function isMp4Audio(bytes: Buffer): boolean {
  if (bytes.length < 12) return false;
  return bytes.toString("latin1", 4, 8) === "ftyp";
}

/**
 * Whapi voice notes are OGG/Opus (`POST /messages/voice`).
 * Chrome records WebM/Opus and some browsers record MP4/AAC, so convert only
 * those cases. OGG is passed through and does not start ffmpeg.
 */
export async function prepareWhatsAppVoice(bytes: Buffer, declaredMime: string): Promise<{
  bytes: Buffer;
  mimeType: "audio/ogg";
}> {
  if (bytes.length === 0 || bytes.length > MAX_VOICE_BYTES) throw whatsappError.mediaTooLarge();
  const sniffed = sniffWhatsAppMedia(bytes);
  if (sniffed === "audio/ogg") return { bytes, mimeType: "audio/ogg" };
  const declared = declaredMime.split(";")[0]?.trim().toLowerCase() ?? "";
  const convertible = (sniffed === "audio/mp4" || isMp4Audio(bytes) || isWebm(bytes)) &&
    (declared === "" ||
      declared === "audio/webm" ||
      declared === "video/webm" ||
      declared === "audio/mp4" ||
      declared === "audio/ogg" ||
      declared === "video/mp4");
  if (!convertible) throw whatsappError.mediaInvalidType();
  const converted = await convertToOggOpus(bytes);
  if (sniffWhatsAppMedia(converted) !== "audio/ogg") throw whatsappError.voiceUnsupported();
  return { bytes: converted, mimeType: "audio/ogg" };
}

function runFfmpeg(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      resolveFfmpegExecutable(),
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        "-i",
        inputPath,
        "-vn",
        "-c:a",
        "libopus",
        "-b:a",
        "32k",
        "-ar",
        "48000",
        "-ac",
        "1",
        "-f",
        "ogg",
        outputPath,
      ],
      { stdio: ["ignore", "ignore", "ignore"], windowsHide: true },
    );
    let settled = false;
    const timer = setTimeout(() => {
      child.kill();
      finish(whatsappError.voiceUnsupported());
    }, VOICE_TIMEOUT_MS);
    const finish = (error: Error | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    child.on("error", () => finish(whatsappError.voiceUnsupported()));
    child.on("close", (code) => {
      if (code !== 0) {
        finish(whatsappError.voiceUnsupported());
        return;
      }
      finish(null);
    });
  });
}

async function convertToOggOpus(bytes: Buffer): Promise<Buffer> {
  await acquireConversion();
  const dir = await mkdtemp(path.join(tmpdir(), "diamond-wa-voice-"));
  try {
    const inputPath = path.join(dir, "in.bin");
    const outputPath = path.join(dir, "out.ogg");
    await writeFile(inputPath, bytes, { mode: 0o600 });
    await runFfmpeg(inputPath, outputPath);
    const output = await readFile(outputPath);
    if (output.length === 0 || output.length > MAX_VOICE_BYTES) throw whatsappError.mediaTooLarge();
    return output;
  } finally {
    await rm(dir, { recursive: true, force: true });
    releaseConversion();
  }
}
