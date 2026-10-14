import { writeFileSync } from "node:fs";
import { buildApp } from "src/app";
import { createFinanceStatementService } from "src/modules/finance/finance-statement.service";
import { renderFinanceStatementPdf } from "src/modules/finance/finance-statement-pdf.service";

async function main() {
  const app = await buildApp();
  const svc = createFinanceStatementService(app.prisma);
  const snap = await svc.loadSnapshot("ELITE", {
    periodType: "MONTHLY",
    year: 2026,
    month: 10,
    locale: "ar",
  });
  const buf = await renderFinanceStatementPdf(snap);
  const out =
    "D:/projects/DiamondElite/fullproject/Diamond-Proj/APP/frontend/test-results/finance-statement-elite-2026-10-sample.pdf";
  writeFileSync(out, buf);
  console.log(
    JSON.stringify({
      out,
      bytes: buf.length,
      lines: snap.lines.length,
      collected: snap.summary.totalCollections,
    }),
  );
  await app.close();
}
main();
