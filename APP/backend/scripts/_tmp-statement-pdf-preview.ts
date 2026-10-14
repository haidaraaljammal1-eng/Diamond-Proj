import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { buildApp } from "src/app";
import { createFinanceStatementService } from "src/modules/finance/finance-statement.service";
import { renderFinanceStatementPdf } from "src/modules/finance/finance-statement-pdf.service";

const OUT_DIR =
  "D:/projects/DiamondElite/fullproject/Diamond-Proj/APP/frontend/test-results/finance-statement-previews";

async function writePdf(
  label: string,
  company: "ELITE" | "UNIQUE",
  query: Parameters<ReturnType<typeof createFinanceStatementService>["loadSnapshot"]>[1],
) {
  const app = await buildApp();
  const svc = createFinanceStatementService(app.prisma);
  const snap = await svc.loadSnapshot(company, query);
  const buf = await renderFinanceStatementPdf(snap);
  const pdfPath = join(OUT_DIR, `${label}.pdf`);
  writeFileSync(pdfPath, buf);
  await app.close();
  return { pdfPath, lines: snap.lines.length, bytes: buf.length };
}

async function pdfToPng(pdfPath: string, pngPath: string, pageIndex: number) {
  const require = createRequire(import.meta.url);
  const pdfjs = require("pdfjs-dist/legacy/build/pdf.mjs") as typeof import("pdfjs-dist");
  const { createCanvas } = require("@napi-rs/canvas") as typeof import("@napi-rs/canvas");
  const data = new Uint8Array(await import("node:fs").then((fs) => fs.promises.readFile(pdfPath)));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const page = await doc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx as never, viewport }).promise;
  writeFileSync(pngPath, canvas.toBuffer("image/png"));
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const elite = await writePdf("elite-2026-10-ar-refined", "ELITE", {
    periodType: "MONTHLY",
    year: 2026,
    month: 10,
    locale: "ar",
  });
  const unique = await writePdf("unique-2026-10-ar-refined", "UNIQUE", {
    periodType: "MONTHLY",
    year: 2026,
    month: 10,
    locale: "ar",
  });
  const dense = await writePdf("elite-dense-haidara-test", "ELITE", {
    periodType: "MONTHLY",
    year: 2026,
    month: 10,
    locale: "ar",
  });

  const shots: string[] = [];
  for (const base of ["elite-2026-10-ar-refined", "unique-2026-10-ar-refined"]) {
    const pdf = join(OUT_DIR, `${base}.pdf`);
    const png = join(OUT_DIR, `${base}-page1.png`);
    try {
      await pdfToPng(pdf, png, 0);
      shots.push(png);
    } catch (e) {
      console.warn("png skip", base, e);
    }
  }

  console.log(JSON.stringify({ OUT_DIR, elite, unique, dense, screenshots: shots }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
