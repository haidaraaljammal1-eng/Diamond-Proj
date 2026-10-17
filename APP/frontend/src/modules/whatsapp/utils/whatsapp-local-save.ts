import { fetchWhatsAppMediaBlob } from "../api/whatsapp.api";
import type { WhatsAppMessageDto } from "../types/whatsapp.types";
import {
  detectLocalSaveCapability,
  initialLocalSaveToolbarVisible,
  isPickerAbort,
  type LocalSaveCapability,
} from "./whatsapp-local-save-capability";

export { isPickerAbort };

const DB_NAME = "diamond-whatsapp-local-media";
const DB_STORE = "settings";
const HANDLE_KEY = "directory";
const ENABLED_KEY = "enabled";
const SAVED_IDS_KEY = "savedMessageIds";
const MAX_SAVED_IDS = 2000;
const BACKLOG_BATCH = 4;

export { detectLocalSaveCapability, initialLocalSaveToolbarVisible };
export type { LocalSaveCapability };
export type LocalSaveStatus = "off" | "configured" | "permission" | "manual" | "iphone";

export interface LocalSaveFailure {
  messageId: string;
  filename: string;
}

type Listener = () => void;

const primed = new Map<string, Set<string>>();
let failures: LocalSaveFailure[] = [];
const listeners = new Set<Listener>();
let backlogInFlight = false;

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeLocalSave(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function localSaveFailures(): LocalSaveFailure[] {
  return failures;
}

function browserStorageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (!browserStorageAvailable()) return Promise.reject(new Error("indexedDB unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const request = tx.objectStore(DB_STORE).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function localSaveEnabled(): Promise<boolean> {
  if (!browserStorageAvailable()) return false;
  return (await idbGet<boolean>(ENABLED_KEY)) === true;
}

export async function setLocalSaveEnabled(enabled: boolean): Promise<void> {
  await idbSet(ENABLED_KEY, enabled);
  notify();
}

type DirectoryPermissionHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
};

async function storedDirectory(): Promise<DirectoryPermissionHandle | null> {
  return idbGet<DirectoryPermissionHandle>(HANDLE_KEY);
}

export async function chooseLocalSaveDirectory(): Promise<boolean> {
  if (typeof window === "undefined" || !browserStorageAvailable()) return false;
  const picker = (window as Window & {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  }).showDirectoryPicker;
  if (!picker) return false;
  try {
    const handle = (await picker()) as DirectoryPermissionHandle;
    const permission = await handle.requestPermission?.({ mode: "readwrite" });
    if (permission && permission !== "granted") return false;
    await idbSet(HANDLE_KEY, handle);
    await idbSet(ENABLED_KEY, true);
    notify();
    return true;
  } catch (error) {
    if (isPickerAbort(error)) return false;
    return false;
  }
}

export async function localSaveStatus(): Promise<LocalSaveStatus> {
  const capability = detectLocalSaveCapability();
  if (capability === "iphone") return "iphone";
  if (capability === "manual") return "manual";
  const handle = await storedDirectory();
  if (!handle) return "off";
  const permission = await handle.queryPermission?.({ mode: "readwrite" });
  if (permission && permission !== "granted") return "permission";
  return "configured";
}

async function autoSaveReady(): Promise<boolean> {
  if (detectLocalSaveCapability() !== "directory") return false;
  if (!(await localSaveEnabled())) return false;
  const handle = await storedDirectory();
  if (!handle) return false;
  const permission = await handle.queryPermission?.({ mode: "readwrite" });
  return !permission || permission === "granted";
}

async function rememberSaved(messageId: string): Promise<void> {
  const ids = (await idbGet<string[]>(SAVED_IDS_KEY)) ?? [];
  if (ids.includes(messageId)) return;
  await idbSet(SAVED_IDS_KEY, [...ids, messageId].slice(-MAX_SAVED_IDS));
}

function safeName(filename: string, messageId: string): string {
  const cleaned = filename.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120) || "file";
  const dot = cleaned.lastIndexOf(".");
  const base = dot > 0 ? cleaned.slice(0, dot) : cleaned;
  const ext = dot > 0 ? cleaned.slice(dot) : "";
  return `${base}-${messageId.slice(0, 8)}${ext}`;
}

async function writeBlob(handle: DirectoryPermissionHandle, name: string, blob: Blob): Promise<void> {
  const fileHandle = await handle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function saveIncomingMedia(message: WhatsAppMessageDto): Promise<boolean> {
  if (!(await autoSaveReady())) return false;
  const handle = await storedDirectory();
  if (!handle) return false;
  const filename = safeName(message.mediaFilename || message.messageType.toLowerCase(), message.id);
  try {
    const blob = await fetchWhatsAppMediaBlob(message.id);
    await writeBlob(handle, filename, blob);
    await rememberSaved(message.id);
    failures = failures.filter((item) => item.messageId !== message.id);
    notify();
    return true;
  } catch {
    if (!failures.some((item) => item.messageId === message.id)) {
      failures = [...failures, { messageId: message.id, filename }];
    }
    notify();
    return false;
  }
}

/** Bounded catch-up for eligible media in the open conversation (7-day server window). */
export async function reconcileUnsavedMedia(messages: WhatsAppMessageDto[]): Promise<void> {
  if (backlogInFlight) return;
  if (!(await autoSaveReady())) return;
  const eligible = messages.filter(
    (message) =>
      message.direction === "INBOUND" && message.hasProtectedMedia && !message.mediaExpired,
  );
  if (eligible.length === 0) return;

  backlogInFlight = true;
  try {
    const saved = new Set((await idbGet<string[]>(SAVED_IDS_KEY)) ?? []);
    let processed = 0;
    for (const message of eligible) {
      if (processed >= BACKLOG_BATCH) break;
      if (saved.has(message.id)) continue;
      const ok = await saveIncomingMedia(message);
      if (ok) {
        saved.add(message.id);
        processed += 1;
      }
    }
  } finally {
    backlogInFlight = false;
  }
}

/** Saves new inbound media after the conversation view is primed. */
export function observeIncomingMedia(conversationId: string, messages: WhatsAppMessageDto[]): void {
  let seen = primed.get(conversationId);
  if (!seen) {
    primed.set(conversationId, new Set(messages.map((message) => message.id)));
    void reconcileUnsavedMedia(messages);
    return;
  }
  for (const message of messages) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    if (message.direction !== "INBOUND" || !message.hasProtectedMedia || message.mediaExpired) continue;
    void saveIncomingMedia(message);
  }
}

export async function retryLocalSave(message: WhatsAppMessageDto): Promise<void> {
  await saveIncomingMedia(message);
}
