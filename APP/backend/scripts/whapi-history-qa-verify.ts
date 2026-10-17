import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertTestDatabaseUrl } from "../tests/helpers/integration-harness";

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
assertTestDatabaseUrl(url);

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const unread = await prisma.whatsAppConversation.aggregate({
    _sum: { unreadCount: true },
    _max: { unreadCount: true },
    _count: true,
  });
  const messageCount = await prisma.whatsAppMessage.count();
  const historySource = await prisma.whatsAppMessage.count({
    where: { displayPayload: { path: ["source"], equals: "history_import" } },
  });
  const withMediaStore = await prisma.whatsAppMessage.count({
    where: {
      providerMediaId: { not: null },
      NOT: { displayPayload: { path: ["mediaStore", "key"], string_starts_with: "" } },
    },
  });
  console.log(
    JSON.stringify({
      conversationCount: unread._count,
      unreadSum: unread._sum.unreadCount ?? 0,
      unreadMax: unread._max.unreadCount ?? 0,
      messageCount,
      historySourceTagged: historySource,
      messagesWithLocalMediaStore: withMediaStore,
    }),
  );
  await prisma.$disconnect();
}

main();
