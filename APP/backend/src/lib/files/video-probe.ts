import { spawn } from "node:child_process";
import { env } from "src/config/env";

export type VideoProbeResult = {
  durationSec: number;
  videoCodec: string;
};

function ffprobePath(): string {
  const configured = env.WHATSAPP_FFMPEG_PATH.trim();
  if (configured.length > 0) {
    return configured.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1");
  }
  return "ffprobe";
}

export async function probeMp4Video(filePath: string): Promise<VideoProbeResult> {
  const args = [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=codec_name",
    "-show_entries",
    "format=duration",
    "-of",
    "json",
    filePath,
  ];

  const stdout = await new Promise<string>((resolve, reject) => {
    const proc = spawn(ffprobePath(), args, { windowsHide: true });
    let out = "";
    let err = "";
    proc.stdout.on("data", (chunk) => {
      out += String(chunk);
    });
    proc.stderr.on("data", (chunk) => {
      err += String(chunk);
    });
    proc.on("error", (error) => reject(error));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(err.trim() || `ffprobe exited with code ${code}`));
        return;
      }
      resolve(out);
    });
  });

  let parsed: {
    streams?: Array<{ codec_name?: string }>;
    format?: { duration?: string };
  };
  try {
    parsed = JSON.parse(stdout) as typeof parsed;
  } catch {
    throw new Error("ffprobe returned invalid JSON");
  }

  const codec = parsed.streams?.[0]?.codec_name?.toLowerCase() ?? "";
  const durationRaw = parsed.format?.duration;
  const durationSec = durationRaw != null ? Number(durationRaw) : Number.NaN;

  if (!codec || !Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error("Could not read video metadata");
  }

  return { durationSec, videoCodec: codec };
}

export function isH264Codec(codec: string): boolean {
  return codec === "h264" || codec === "avc1";
}
