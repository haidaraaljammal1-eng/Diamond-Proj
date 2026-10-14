import { randomUUID } from "node:crypto";
import type { ArchiveImportPreparedVehicle } from "src/modules/archive/archive-import.types";

const TTL_MS = 15 * 60 * 1000;

export interface ArchiveImportSession {
  token: string;
  userId: number;
  filename: string;
  createdAt: number;
  vehicles: ArchiveImportPreparedVehicle[];
}

const sessions = new Map<string, ArchiveImportSession>();

function purgeExpired(): void {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now - session.createdAt > TTL_MS) sessions.delete(token);
  }
}

export function createArchiveImportSession(
  userId: number,
  filename: string,
  vehicles: ArchiveImportPreparedVehicle[],
): string {
  purgeExpired();
  const token = randomUUID();
  sessions.set(token, {
    token,
    userId,
    filename,
    createdAt: Date.now(),
    vehicles,
  });
  return token;
}

export function consumeArchiveImportSession(
  token: string,
  userId: number,
): ArchiveImportSession | null {
  purgeExpired();
  const session = sessions.get(token);
  if (!session) return null;
  if (session.userId !== userId) return null;
  if (Date.now() - session.createdAt > TTL_MS) {
    sessions.delete(token);
    return null;
  }
  sessions.delete(token);
  return session;
}

export function clearArchiveImportSessionsForTests(): void {
  sessions.clear();
}
