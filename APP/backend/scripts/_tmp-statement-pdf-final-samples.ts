import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { buildApp } from "src/app";
import { createFinanceStatementService } from "src/modules/finance/finance-statement.service";
import { renderFinanceStatementPdf } from "src/modules/finance/finance-statement-pdf.service";
import {
  fixtureDense,
  fixtureTwoOrdinary,
  fixtureUniqueEn,
} from "../tests/helpers/finance-statement-pdf.fixtures";

const OUT =
  "D:/projects/DiamondElite/fullproject/Diamond-Proj/APP/frontend/test-results/finance-statement-v2";

async function main() {
  mkdirSync(OUT, { recursive: true });

  const app = await buildApp();
  const svc = createFinanceStatementService(app.prisma);

  const eliteDb = await svc.loadSnapshot("ELITE", {
    periodType: "MONTHLY",
    year: 2026,
    month: 10,
    locale: "ar",
  });
  const uniqueDb = await svc.loadSnapshot("UNIQUE", {
    periodType: "MONTHLY",
    year: 2026,
    month: 10,
    locale: "ar",
  });
  await app.close();

  const outputs: { name: string; buf: Buffer }[] = [
    { name: "elite-ar-db-oct-2026", buf: await renderFinanceStatementPdf(eliteDb) },
    { name: "unique-ar-db-oct-2026", buf: await renderFinanceStatementPdf(uniqueDb) },
    { name: "elite-ar-fixture-two", buf: await renderFinanceStatementPdf(fixtureTwoOrdinary()) },
    { name: "unique-en-fixture", buf: await renderFinanceStatementPdf(fixtureUniqueEn()) },
    { name: "elite-ar-dense-110", buf: await renderFinanceStatementPdf(fixtureDense(110)) },
  ];

  for (const { name, buf } of outputs) {
    const pdf = join(OUT, `${name}.pdf`);
    writeFileSync(pdf, buf);
    try {
      execFileSync(
        "python",
        [
          "-c",
          `import fitz,sys; p=sys.argv[1]; d=fitz.open(p); d[0].get_pixmap(matrix=fitz.Matrix(2,2)).save(p.replace('.pdf','-page1.png')); mid=min(1,len(d)-1); d[mid].get_pixmap(matrix=fitz.Matrix(2,2)).save(p.replace('.pdf',f'-page{mid+1}.png'))`,
          pdf,
        ],
        { stdio: "inherit" },
      );
    } catch (e) {
      console.warn("png skip", name, e);
    }
  }

  console.log(JSON.stringify({ OUT, files: outputs.map((o) => o.name) }, null, 2));
}

main();
