import { test } from "node:test";
import assert from "node:assert/strict";
import { renderFinanceStatementPdf } from "src/modules/finance/finance-statement-pdf.service";
import {
  fixtureDense,
  fixtureEmpty,
  fixtureLongRefs,
  fixtureMixedDays,
  fixtureTwoOrdinary,
  fixtureUniqueEn,
} from "../helpers/finance-statement-pdf.fixtures";

function pageCount(buf: Buffer): number {
  const m = buf.toString("latin1").match(/\/Type\s*\/Page\b/g);
  return m?.length ?? 0;
}

async function extractPdfText(buf: Buffer): Promise<string | null> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { writeFileSync, unlinkSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const execFileAsync = promisify(execFile);
  const tmp = join(tmpdir(), `stmt-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  writeFileSync(tmp, buf);
  try {
    const { stdout } = await execFileAsync(
      "python",
      [
        "-c",
        "import fitz,sys; d=fitz.open(sys.argv[1]); print(''.join(d[i].get_text() for i in range(d.page_count)))",
        tmp,
      ],
      { env: { ...process.env, PYTHONIOENCODING: "utf-8" } },
    );
    return stdout;
  } catch {
    return null;
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* */
    }
  }
}

const UUID_FRAGMENT = "aa521c94-e0eb";

test("fixture A: two ordinary transactions fit on one page", async () => {
  const buf = await renderFinanceStatementPdf(fixtureTwoOrdinary());
  assert.equal(buf.subarray(0, 4).toString(), "%PDF");
  assert.equal(pageCount(buf), 1, "two transactions must fit on one A4 landscape page");
  assert.ok(buf.length > 4_000);
  const text = await extractPdfText(buf);
  assert.ok(text, "PyMuPDF text extraction is required");
  assert.ok(text.includes("2026-10-01 → 2026-10-31"), "period range with forward arrow");
  assert.ok(text.includes("التقرير"), "Arabic reporting-period label (PyMuPDF may reshape فترة)");
  assert.ok(text.includes("DE-2026-000201"), "contract in PDF text");
  assert.ok(text.includes("DE-2026-000192"), "second contract in PDF text");
  assert.ok(text.includes("3805") || text.includes("3,805"));
  assert.equal(text.includes(UUID_FRAGMENT), false, "ledger UUID must stay off the page");
  assert.equal(text.includes("QA-RENEWAL-VISUAL"), false, "vehicle name must stay off the page");
  assert.equal(text.includes("بطاقة"), false, "payment method must stay off the page");
});

test("fixture B: long reference UUID is not visible; contract number and amount are", async () => {
  const buf = await renderFinanceStatementPdf(fixtureLongRefs());
  assert.equal(buf.subarray(0, 4).toString(), "%PDF");
  const text = await extractPdfText(buf);
  assert.ok(text, "PyMuPDF text extraction is required");
  const compact = text.replace(/\s+/g, "");
  assert.equal(compact.includes(UUID_FRAGMENT), false, "referenceId must not appear in the description");
  assert.ok(
    compact.includes("DE-2026-000192-GA-RENEWAL-EXTENDED-ID"),
    "full contract number remains even when the column wraps",
  );
  assert.ok(text.includes("500"));
  assert.equal(text.includes("Land Rover"), false, "vehicle metadata must stay off the page");
});

test("fixture E/F: mixed days and adjustments", async () => {
  const buf = await renderFinanceStatementPdf(fixtureMixedDays());
  assert.ok(pageCount(buf) >= 1);
});

test("pagination: 10, 50 and 100 synthetic lines", async () => {
  const p10 = pageCount(await renderFinanceStatementPdf(fixtureDense(10)));
  const p50 = pageCount(await renderFinanceStatementPdf(fixtureDense(50)));
  const p100 = pageCount(await renderFinanceStatementPdf(fixtureDense(100)));
  assert.ok(p10 >= 1 && p10 <= 4);
  assert.ok(p50 >= 2 && p50 <= 12);
  assert.ok(p100 >= 4 && p100 <= 28);
});

test("fixture G: 110 lines multipage without split errors", async () => {
  const buf = await renderFinanceStatementPdf(fixtureDense(110));
  assert.ok(pageCount(buf) >= 4 && pageCount(buf) <= 24);
  const text = await extractPdfText(buf);
  assert.ok(text, "PyMuPDF text extraction is required");
  assert.ok(text.includes("dense-0"));
  assert.ok(text.includes("dense-109"));
  assert.equal(text.includes(UUID_FRAGMENT), false, "dense reference UUIDs must stay off the page");
});

test("fixture H: empty period premium PDF", async () => {
  const buf = await renderFinanceStatementPdf(fixtureEmpty());
  assert.ok(buf.length > 3_000);
  assert.ok(pageCount(buf) === 1);
});

test("UNIQUE English branding snapshot", async () => {
  const buf = await renderFinanceStatementPdf(fixtureUniqueEn());
  const text = await extractPdfText(buf);
  assert.ok(text, "PyMuPDF text extraction is required");
  assert.ok(text.includes("UNIQUE"));
  assert.ok(text.includes("DETAILED FINANCIAL STATEMENT"));
  assert.equal(buf.subarray(0, 4).toString(), "%PDF");
});
