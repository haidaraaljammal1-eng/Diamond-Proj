import { hostname } from "node:os";
import { randomUUID } from "node:crypto";

let ownerToken: string | undefined;

/** Process-lifetime token for sync lease ownership (no secrets). */
export function getGpsSyncInstanceOwnerToken(): string {
  if (!ownerToken) {
    const host = hostname().replace(/[^\w.-]/g, "_").slice(0, 64);
    ownerToken = `${host}:${process.pid}:${randomUUID()}`;
  }
  return ownerToken;
}

/** Test-only reset. */
export function resetGpsSyncInstanceOwnerTokenForTests(): void {
  ownerToken = undefined;
}
