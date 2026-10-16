import type { Prisma, PrismaClient } from "@prisma/client";
import {
  markMediaStoreExpired,
  readMediaStore,
  removeStoredMedia,
  whatsappMediaRoot,
} from "src/modules/whatsapp/whatsapp.media-store";

const CLEANUP_BATCH = 100;

function payloadFromRow(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  return value;
}

/**
 * Deletes expired shared files and leaves the message row in place.
 * A missing file is still a successful cleanup. Safe to run again.
 * Expiry is decided in process so the test clock and PostgreSQL agree.
 */
export async function cleanupExpiredWhatsAppMedia(
  prisma: PrismaClient,
  now: Date = new Date(),
  root: string = whatsappMediaRoot(),
): Promise<{ expired: number }> {
  const rows = await prisma.$queryRaw<Array<{ id: string; payload: Prisma.JsonValue }>>`
    SELECT id, "displayPayload" AS payload
    FROM whatsapp_messages
    WHERE "displayPayload" #>> '{mediaStore,key}' IS NOT NULL
      AND "displayPayload" #>> '{mediaStore,key}' <> ''
    ORDER BY id
    LIMIT ${CLEANUP_BATCH}
  `;
  let expired = 0;
  for (const row of rows) {
    const payload = payloadFromRow(row.payload);
    const current = readMediaStore(payload);
    const next = markMediaStoreExpired(payload, now);
    if (!current?.key || !next) continue;
    await removeStoredMedia(root, current.key);
    await prisma.whatsAppMessage.update({
      where: { id: row.id },
      data: { displayPayload: next as Prisma.InputJsonValue },
    });
    expired += 1;
  }
  return { expired };
}
