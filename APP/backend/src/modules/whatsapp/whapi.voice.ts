import { spawn } from "node:child_process";
import { sniffWhatsAppMedia } from "src/modules/whatsapp/whatsapp.media";
import { whatsappError } from "src/modules/whatsapp/whatsapp.errors";
import { WHAPI_MEDIA_MAX_BYTES } from "src/modules/whatsapp/whapi.config";

const VOICE_TIMEOUT_MS = 20_000;
const MAX_VOICE_BYTES = WHAPI_MEDIA_MAX_BYTES.AUDIO;

function isWebm(bytes: Buffer): boolean {
  return bytes.length > 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
}

function isMp4Audio(bytes: Buffer): boolean {
  if (bytes.length < 12) return false;
  return bytes.toString("latin1", 4, 8) === "ftyp";
}

/**
 * Whapi voice notes are OGG/Opus (`POST /messages/voice`).
 * Chrome records WebM/Opus, so convert only that case with the system ffmpeg,
 * bounded by time and output size. OGG is passed through.
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

function convertToOggOpus(bytes: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-c:a", "libopus", "-b:a", "32k", "-f", "ogg", "pipe:1"],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    const chunks: Buffer[] = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill();
      finish(whatsappError.voiceUnsupported());
    }, VOICE_TIMEOUT_MS);
    const finish = (error: Error | null, value?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value ?? Buffer.alloc(0));
    };
    child.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      const total = chunks.reduce((sum, item) => sum + item.length, 0);
      if (total > MAX_VOICE_BYTES) {
        child.kill();
        finish(whatsappError.mediaTooLarge());
      }
    });
    child.on("error", () => finish(whatsappError.voiceUnsupported()));
    child.on("close", (code) => {
      if (code !== 0) {
        finish(whatsappError.voiceUnsupported());
        return;
      }
      finish(null, Buffer.concat(chunks));
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(bytes);
  });
}
