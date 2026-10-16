import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { env } from "src/config/env";

/** Shared office copies expire 168 hours after the bytes are stored. */
export const WHATSAPP_MEDIA_RETENTION_MS = 168 * 60 * 60 * 1000;

const KEY_PATTERN = /^[a-f0-9]{2}\/[a-f0-9]{2}\/[0-9a-f-]{36}$/;

export interface WhatsAppMediaStoreRecord {
  v: 1;
  key: string;
  sha256: string;
  bytes: number;
  ingestedAt: string;
  expiresAt: string;
  voice: boolean;
  expired?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function whatsappMediaRoot(): string {
  const configured = env.WHATSAPP_MEDIA_ROOT.trim();
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), "..", "..", "var", "whatsapp-media");
}

export function buildMediaStoreRecord(input: {
  key: string;
  sha256: string;
  bytes: number;
  ingestedAt: Date;
  voice: boolean;
}): WhatsAppMediaStoreRecord {
  return {
    v: 1,
    key: input.key,
    sha256: input.sha256,
    bytes: input.bytes,
    ingestedAt: input.ingestedAt.toISOString(),
    expiresAt: new Date(input.ingestedAt.getTime() + WHATSAPP_MEDIA_RETENTION_MS).toISOString(),
    voice: input.voice,
  };
}

export function readMediaStore(payload: unknown): WhatsAppMediaStoreRecord | null {
  const root = asRecord(payload);
  const store = asRecord(root?.mediaStore);
  if (!store || store.v !== 1) return null;
  const key = typeof store.key === "string" ? store.key : "";
  const sha256 = typeof store.sha256 === "string" ? store.sha256 : "";
  const ingestedAt = typeof store.ingestedAt === "string" ? store.ingestedAt : "";
  const expiresAt = typeof store.expiresAt === "string" ? store.expiresAt : "";
  const bytes = typeof store.bytes === "number" ? store.bytes : 0;
  if (!ingestedAt || !expiresAt) return null;
  return {
    v: 1,
    key,
    sha256,
    bytes,
    ingestedAt,
    expiresAt,
    voice: store.voice === true,
    expired: store.expired === true,
  };
}

export function readVoiceNoteFlag(payload: unknown): boolean {
  const store = readMediaStore(payload);
  if (store?.voice) return true;
  const whapi = asRecord(asRecord(payload)?.whapi);
  return whapi?.voice === true;
}

export function mediaStoreExpired(record: WhatsAppMediaStoreRecord | null, now: Date): boolean {
  if (!record) return false;
  if (record.expired) return true;
  const expires = Date.parse(record.expiresAt);
  return Number.isFinite(expires) && expires <= now.getTime();
}

export function mergeMediaStore(current: unknown, store: WhatsAppMediaStoreRecord): Record<string, unknown> {
  const base = asRecord(current) ? { ...(current as Record<string, unknown>) } : {};
  base.mediaStore = store;
  return base;
}

export function markMediaStoreExpired(current: unknown, now: Date): Record<string, unknown> | null {
  const record = readMediaStore(current);
  if (!record || !record.key) return null;
  if (!mediaStoreExpired(record, now) && record.expired !== true) return null;
  const base = asRecord(current) ? { ...(current as Record<string, unknown>) } : {};
  base.mediaStore = {
    v: 1,
    sha256: record.sha256,
    bytes: record.bytes,
    ingestedAt: record.ingestedAt,
    expiresAt: record.expiresAt,
    voice: record.voice,
    expired: true,
  };
  return base;
}

export function assertMediaKey(key: string): string {
  if (!KEY_PATTERN.test(key)) throw new Error("invalid_media_key");
  return key;
}

export function resolveStoredMediaPath(root: string, key: string): string {
  const safe = assertMediaKey(key);
  const rootResolved = path.resolve(root);
  const full = path.resolve(rootResolved, ...safe.split("/"));
  const relative = path.relative(rootResolved, full);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("invalid_media_key");
  return full;
}

export function allocateMediaKey(): string {
  const id = randomUUID();
  return `${id.slice(0, 2)}/${id.slice(2, 4)}/${id}`;
}

export async function writeStoredMedia(
  root: string,
  bytes: Buffer,
): Promise<{ key: string; sha256: string }> {
  const key = allocateMediaKey();
  const full = resolveStoredMediaPath(root, key);
  await mkdir(path.dirname(full), { recursive: true });
  const temp = `${full}.partial`;
  const handle = await open(temp, "wx");
  try {
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
  await rename(temp, full);
  return { key, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function readStoredMedia(root: string, key: string): Promise<Buffer> {
  return readFile(resolveStoredMediaPath(root, key));
}

export async function removeStoredMedia(root: string, key: string): Promise<void> {
  await rm(resolveStoredMediaPath(root, key), { force: true });
}

export async function storedMediaExists(root: string, key: string): Promise<boolean> {
  try {
    const info = await stat(resolveStoredMediaPath(root, key));
    return info.isFile();
  } catch {
    return false;
  }
}
