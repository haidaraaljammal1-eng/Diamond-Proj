import type { Prisma, PrismaClient } from "@prisma/client";

type ContactSyncDb = PrismaClient | Prisma.TransactionClient;

/** Clears pagination state when a connection is replaced (profiles cascade with connection delete). */
export async function resetWhatsAppContactSyncState(
  prisma: ContactSyncDb,
  connectionId: string,
): Promise<void> {
  await prisma.whatsAppContactSyncState.deleteMany({ where: { connectionId } });
}
