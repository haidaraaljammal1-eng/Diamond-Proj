/**
 * Financial Statement PDF — presentation layer (rebuilt ledger layout).
 * Data contract: FinanceStatementSnapshot from finance-statement.service.ts
 */
import PDFDocument from "pdfkit";
import type { FinanceStatementDayGroup, FinanceStatementLine, FinanceStatementSnapshot } from "src/modules/finance/finance-statement.service";
import { invoiceLogoAssetPath } from "src/modules/invoices/invoice-logo";
import { formatDate } from "src/modules/reports/report-format";
import { registerReportFonts, REPORT_FONT_BOLD, REPORT_FONT_REGULAR } from "src/modules/reports/report-fonts";
import { renderRtlText, wrapText, type BaseDirection } from "src/modules/reports/report-rtl";

const MARGIN = 32;
const FOOTER_H = 18;
const INK = "#1c1812";
const GOLD = "#9a7b3c";
const GOLD_LIGHT = "#f3ead8";
const MUTED = "#5c5348";
const IVORY = "#fffdf8";
const IVORY_BAND = "#fbf6eb";
const HAIRLINE = "#e5dcc8";
const WHITE = "#ffffff";

const FONT_BODY = 8.5;
const FONT_LABEL = 7;
const CELL_LINE_GAP = 1;

function formatAed(amount: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount);
}

function formatAmountCell(value: number): string {
  if (value === 0) return "—";
  return formatAed(value);
}

const pad = (n: number) => String(n).padStart(2, "0");

function formatTimeOnly(d: Date, offsetMinutes: number): string {
  const shifted = new Date(d.getTime() + offsetMinutes * 60_000);
  return `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
}

function formatDateTimeFull(d: Date, offsetMinutes: number): string {
  return `${formatDate(d, offsetMinutes)} ${formatTimeOnly(d, offsetMinutes)}`;
}

type Doc = InstanceType<typeof PDFDocument>;

interface Copy {
  titleAr: string;
  titleEn: string;
  period: string;
  generated: string;
  timezone: string;
  currency: string;
  summaryTitle: string;
  collections: string;
  grossExpenses: string;
  reversals: string;
  netExpenses: string;
  netMovement: string;
  ledgerTitle: string;
  colTime: string;
  colContract: string;
  colDesc: string;
  colIn: string;
  colOut: string;
  colAdj: string;
  colNet: string;
  dayTotal: string;
  periodTotal: string;
  empty: string;
  page: string;
  of: string;
}

function copy(locale: FinanceStatementSnapshot["locale"]): Copy {
  if (locale === "ar") {
    return {
      titleAr: "كشف تفصيلي للحركة المالية",
      titleEn: "DETAILED FINANCIAL STATEMENT",
      period: "فترة التقرير",
      generated: "تاريخ الإنشاء",
      timezone: "المنطقة الزمنية",
      currency: "العملة",
      summaryTitle: "ملخص الحركة المالية",
      collections: "إجمالي التحصيلات المؤكدة",
      grossExpenses: "إجمالي المصروفات",
      reversals: "عكس المصروفات / التعديلات",
      netExpenses: "صافي المصروفات",
      netMovement: "صافي الحركة",
      ledgerTitle: "سجل الحركات التفصيلي",
      colTime: "الوقت",
      colContract: "العقد",
      colDesc: "الحركة / الوصف",
      colIn: "وارد (AED)",
      colOut: "صادر (AED)",
      colAdj: "تعديل (AED)",
      colNet: "صافي تراكمي (AED)",
      dayTotal: "إجمالي اليوم",
      periodTotal: "إجمالي الفترة",
      empty: "لا توجد حركات مالية في هذه الفترة",
      page: "صفحة",
      of: "من",
    };
  }
  return {
    titleAr: "كشف تفصيلي للحركة المالية",
    titleEn: "DETAILED FINANCIAL STATEMENT",
    period: "Reporting period",
    generated: "Generated at",
    timezone: "Timezone",
    currency: "Currency",
    summaryTitle: "Financial summary",
    collections: "Total confirmed collections",
    grossExpenses: "Gross expenses",
    reversals: "Expense reversals / adjustments",
    netExpenses: "Net expenses",
    netMovement: "Net movement",
    ledgerTitle: "Detailed transaction ledger",
    colTime: "Time",
    colContract: "Contract",
    colDesc: "Transaction / description",
    colIn: "Money in (AED)",
    colOut: "Money out (AED)",
    colAdj: "Adjustment (AED)",
    colNet: "Running net (AED)",
    dayTotal: "Day total",
    periodTotal: "Period total",
    empty: "No financial movements in this period",
    page: "Page",
    of: "of",
  };
}

interface LedgerCols {
  widths: number[];
  xs: number[];
}

function ledgerColumns(contentWidth: number): LedgerCols {
  const time = 52;
  const contract = 82;
  const inW = 68;
  const outW = 68;
  const adjW = 68;
  const netW = 72;
  const desc = contentWidth - (time + contract + inW + outW + adjW + netW);
  const widths = [time, contract, desc, inW, outW, adjW, netW];
  let x = 0;
  const xs = widths.map((w) => {
    const start = x;
    x += w;
    return start;
  });
  return { widths, xs };
}

function primaryDescription(line: FinanceStatementLine): string {
  const parts = [line.categoryLabel];
  if (line.description && line.description !== line.categoryLabel) {
    parts.push(line.description);
  }
  return parts.join(" — ");
}

function dash(value: string | null | undefined): string {
  const v = value?.trim();
  return v ? v : "—";
}

function cellInnerWidth(colWidth: number): number {
  return colWidth - 8;
}

function lineHeightFor(doc: Doc, fontSize: number): number {
  doc.fontSize(fontSize);
  return doc.currentLineHeight() + CELL_LINE_GAP;
}

function measureCenteredCell(
  doc: Doc,
  text: string,
  colWidth: number,
  fontSize: number,
  font: string,
): number {
  doc.font(font).fontSize(fontSize);
  const lines = wrapText(doc, text || "—", cellInnerWidth(colWidth));
  return lines.length * lineHeightFor(doc, fontSize) + 6;
}

function drawCenteredCell(
  doc: Doc,
  text: string,
  x: number,
  y: number,
  colWidth: number,
  rowHeight: number,
  opts: { fontSize: number; font?: string; baseDir?: BaseDirection; color?: string },
): void {
  const font = opts.font ?? REPORT_FONT_REGULAR;
  doc.font(font).fontSize(opts.fontSize).fillColor(opts.color ?? INK);
  const innerW = cellInnerWidth(colWidth);
  const lines = wrapText(doc, text || "—", innerW);
  const lh = lineHeightFor(doc, opts.fontSize);
  const blockH = lines.length * lh;
  let cy = y + Math.max(2, (rowHeight - blockH) / 2);
  const baseDir = opts.baseDir ?? "rtl";
  for (const line of lines) {
    renderRtlText(doc, line, x + 4, cy, innerW, {
      baseDir,
      align: "center",
      lineGap: 0,
      noWrap: true,
    });
    cy += lh;
  }
}

export function renderFinanceStatementPdf(snapshot: FinanceStatementSnapshot): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const L = copy(snapshot.locale);
      const baseDir: BaseDirection = snapshot.locale === "ar" ? "rtl" : "ltr";
      const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margin: MARGIN,
        bufferPages: true,
        info: { Title: L.titleAr },
      });
      registerReportFonts(doc);
      doc.font(REPORT_FONT_REGULAR);

      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const contentWidth = pageWidth - MARGIN * 2;
      const bottom = pageHeight - MARGIN - FOOTER_H;
      const cols = ledgerColumns(contentWidth);
      let y = MARGIN;
      let ledgerHeaderDrawn = false;

      const cellX = (colIndex: number) => MARGIN + cols.xs[colIndex]!;
      const colW = (colIndex: number) => cols.widths[colIndex]!;

      const ensure = (need: number) => {
        if (y + need > bottom) newPage();
      };

      const drawFullHeader = () => {
        const bandH = 66;
        doc.save();
        doc.rect(MARGIN, y, contentWidth, bandH).fill(IVORY_BAND);
        doc.strokeColor(HAIRLINE).lineWidth(0.6).rect(MARGIN, y, contentWidth, bandH).stroke();
        try {
          doc.image(invoiceLogoAssetPath(snapshot.brandKey), MARGIN + 8, y + 10, { width: 110 });
        } catch {
          /* */
        }
        const tx = MARGIN + 128;
        const tw = contentWidth - 136;
        doc.font(REPORT_FONT_BOLD).fontSize(11.5).fillColor(INK);
        renderRtlText(doc, snapshot.companyDisplayName.toUpperCase(), tx, y + 12, tw, {
          baseDir: "ltr",
          align: "start",
        });
        doc.font(REPORT_FONT_REGULAR).fontSize(7).fillColor(MUTED);
        renderRtlText(doc, snapshot.companyLegalName, tx, y + 26, tw, { baseDir: "ltr", align: "start" });
        doc.font(REPORT_FONT_BOLD).fontSize(10.5).fillColor(GOLD);
        renderRtlText(doc, L.titleAr, tx, y + 40, tw, { baseDir: "rtl", align: "start" });
        doc.font(REPORT_FONT_BOLD).fontSize(7.5).fillColor(INK);
        renderRtlText(doc, L.titleEn, tx, y + 54, tw, { baseDir: "ltr", align: "start" });
        doc.restore();
        y += bandH + 6;

        doc.font(REPORT_FONT_REGULAR).fontSize(7.5).fillColor(MUTED);
        y = renderRtlText(
          doc,
          `${L.period}: ${snapshot.periodLabel.from} → ${snapshot.periodLabel.to}`,
          MARGIN,
          y,
          contentWidth,
          { baseDir, align: "start" },
        );
        y += 2;
        y = renderRtlText(
          doc,
          `${L.generated}: ${formatDateTimeFull(snapshot.generatedAt, snapshot.offsetMinutes)} · ${L.timezone}: ${snapshot.timezoneLabel} · ${L.currency}: ${snapshot.currency}`,
          MARGIN,
          y,
          contentWidth,
          { baseDir, align: "start" },
        );
        y += 6;
      };

      const drawCompactHeader = () => {
        const bandH = 28;
        doc.save();
        doc.rect(MARGIN, y, contentWidth, bandH).fill(IVORY_BAND);
        doc.strokeColor(HAIRLINE).lineWidth(0.4).rect(MARGIN, y, contentWidth, bandH).stroke();
        try {
          doc.image(invoiceLogoAssetPath(snapshot.brandKey), MARGIN + 6, y + 5, { width: 48 });
        } catch {
          /* */
        }
        doc.font(REPORT_FONT_BOLD).fontSize(8.5).fillColor(INK);
        renderRtlText(
          doc,
          `${snapshot.companyCode} · ${L.titleEn}`,
          MARGIN + 60,
          y + 8,
          contentWidth - 68,
          { baseDir: "ltr", align: "start" },
        );
        doc.restore();
        y += bandH + 4;
      };

      const newPage = () => {
        doc.addPage();
        y = MARGIN;
        drawCompactHeader();
        if (ledgerHeaderDrawn) drawLedgerColumnHeader();
      };

      const drawSummary = () => {
        doc.font(REPORT_FONT_BOLD).fontSize(8.5).fillColor(GOLD);
        y = renderRtlText(doc, L.summaryTitle, MARGIN, y, contentWidth, { baseDir, align: "start" });
        y += 4;
        const boxH = 50;
        ensure(boxH + 4);
        const top = y;
        doc.save();
        doc.rect(MARGIN, top, contentWidth, boxH).fill(IVORY);
        doc.strokeColor(GOLD).lineWidth(0.8).rect(MARGIN, top, contentWidth, boxH).stroke();
        const items: ReadonlyArray<readonly [string, string]> = [
          [L.collections, formatAed(snapshot.summary.totalCollections)],
          [L.grossExpenses, formatAed(snapshot.summary.grossExpenses)],
          [L.reversals, formatAed(snapshot.summary.expenseReversals)],
          [L.netExpenses, formatAed(snapshot.summary.netExpenses)],
          [L.netMovement, formatAed(snapshot.summary.netMovement)],
        ];
        const cellW = contentWidth / 5;
        items.forEach((item, i) => {
          const label = item[0];
          const value = item[1];
          const x = MARGIN + i * cellW;
          if (i > 0) {
            doc.strokeColor(HAIRLINE).moveTo(x, top + 6).lineTo(x, top + boxH - 6).stroke();
          }
          drawCenteredCell(doc, label, x, top, cellW, boxH * 0.48, {
            fontSize: FONT_LABEL,
            color: MUTED,
            baseDir,
          });
          drawCenteredCell(doc, value, x, top + boxH * 0.42, cellW, boxH * 0.52, {
            fontSize: 11,
            font: REPORT_FONT_BOLD,
            baseDir: "ltr",
          });
        });
        doc.restore();
        y = top + boxH + 8;
      };

      const drawLedgerColumnHeader = () => {
        const headers = [
          L.colTime,
          L.colContract,
          L.colDesc,
          L.colIn,
          L.colOut,
          L.colAdj,
          L.colNet,
        ];
        const h = Math.max(
          18,
          ...headers.map((label, i) =>
            measureCenteredCell(doc, label, colW(i), FONT_LABEL, REPORT_FONT_BOLD),
          ),
        );
        ensure(h);
        const top = y;
        doc.save();
        doc.rect(MARGIN, top, contentWidth, h).fill(GOLD_LIGHT);
        doc.strokeColor(HAIRLINE).rect(MARGIN, top, contentWidth, h).stroke();
        headers.forEach((label, i) => {
          drawCenteredCell(doc, label, cellX(i), top, colW(i), h, {
            fontSize: FONT_LABEL,
            font: REPORT_FONT_BOLD,
            baseDir,
          });
        });
        doc.restore();
        y = top + h;
        ledgerHeaderDrawn = true;
      };

      const rowCells = (line: FinanceStatementLine): string[] => [
        formatTimeOnly(line.occurredAt, snapshot.offsetMinutes),
        dash(line.contractNumber),
        primaryDescription(line),
        formatAmountCell(line.moneyIn),
        formatAmountCell(line.moneyOut),
        formatAmountCell(line.adjustment),
        formatAed(line.cumulativeNet),
      ];

      const measureDataRow = (cells: string[], boldLast = false): number =>
        Math.max(
          ...cells.map((text, i) => {
            const font = boldLast && i === 6 ? REPORT_FONT_BOLD : REPORT_FONT_REGULAR;
            const dir = i === 0 || i === 1 || i >= 3 ? "ltr" : baseDir;
            void dir;
            return measureCenteredCell(doc, text, colW(i), FONT_BODY, font);
          }),
        ) + 4;

      const drawDataRow = (cells: string[], top: number, rowH: number, boldLast = false) => {
        cells.forEach((text, i) => {
          drawCenteredCell(doc, text, cellX(i), top, colW(i), rowH, {
            fontSize: FONT_BODY,
            font: boldLast && i === 6 ? REPORT_FONT_BOLD : REPORT_FONT_REGULAR,
            baseDir: i === 0 || i === 1 || i >= 3 ? "ltr" : baseDir,
          });
        });
      };

      const drawTransaction = (line: FinanceStatementLine) => {
        if (!ledgerHeaderDrawn) drawLedgerColumnHeader();
        const cells = rowCells(line);
        const rowH = measureDataRow(cells, true);
        ensure(rowH);
        const top = y;
        doc.save();
        doc.rect(MARGIN, top, contentWidth, rowH).fill(WHITE);
        doc.strokeColor(HAIRLINE).lineWidth(0.3).rect(MARGIN, top, contentWidth, rowH).stroke();
        drawDataRow(cells, top, rowH, true);
        doc.restore();
        y = top + rowH + 1;
      };

      const drawTotalsRow = (
        label: string,
        moneyIn: number,
        moneyOut: number,
        adjustment: number,
        net: number,
        fill: string,
      ) => {
        const labelW = colW(0) + colW(1) + colW(2);
        const vals = [formatAed(moneyIn), formatAed(moneyOut), formatAed(adjustment), formatAed(net)];
        const h = Math.max(
          18,
          measureCenteredCell(doc, label, labelW, FONT_BODY, REPORT_FONT_BOLD),
          ...vals.map((v, idx) =>
            measureCenteredCell(doc, v, colW(idx + 3), FONT_BODY, REPORT_FONT_BOLD),
          ),
        );
        ensure(h);
        const top = y;
        doc.save();
        doc.rect(MARGIN, top, contentWidth, h).fill(fill);
        drawCenteredCell(doc, label, cellX(0), top, labelW, h, {
          fontSize: FONT_BODY,
          font: REPORT_FONT_BOLD,
          baseDir,
        });
        vals.forEach((v, idx) => {
          drawCenteredCell(doc, v, cellX(idx + 3), top, colW(idx + 3), h, {
            fontSize: FONT_BODY,
            font: REPORT_FONT_BOLD,
            baseDir: "ltr",
          });
        });
        doc.strokeColor(GOLD).lineWidth(0.45).moveTo(MARGIN, top + h).lineTo(MARGIN + contentWidth, top + h).stroke();
        doc.restore();
        y = top + h + 4;
      };

      drawFullHeader();
      drawSummary();

      doc.font(REPORT_FONT_BOLD).fontSize(8.5).fillColor(INK);
      y = renderRtlText(doc, L.ledgerTitle, MARGIN, y, contentWidth, { baseDir, align: "start" });
      y += 4;

      if (snapshot.lines.length === 0) {
        drawLedgerColumnHeader();
        const h = 32;
        ensure(h);
        drawCenteredCell(doc, L.empty, MARGIN, y, contentWidth, h, {
          fontSize: 9,
          color: MUTED,
          baseDir,
        });
        y += h;
      } else {
        for (const group of snapshot.dayGroups) {
          ensure(16);
          doc.font(REPORT_FONT_BOLD).fontSize(8).fillColor(GOLD);
          y = renderRtlText(doc, group.day, MARGIN, y, contentWidth, { baseDir, align: "start" });
          y += 2;
          for (const line of group.lines) {
            drawTransaction(line);
          }
          drawTotalsRow(L.dayTotal, group.moneyIn, group.moneyOut, group.adjustment, group.net, IVORY_BAND);
        }
        drawTotalsRow(
          L.periodTotal,
          snapshot.summary.totalCollections,
          snapshot.summary.grossExpenses,
          snapshot.summary.expenseReversals,
          snapshot.summary.netMovement,
          IVORY,
        );
      }

      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i += 1) {
        doc.switchToPage(i);
        doc.font(REPORT_FONT_REGULAR).fontSize(7).fillColor(MUTED);
        const footer = `${snapshot.companyCode} · ${L.page} ${i + 1} ${L.of} ${pages.count}`;
        renderRtlText(doc, footer, MARGIN, pageHeight - MARGIN, contentWidth, { baseDir, align: "center" });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

export function statementPdfFilename(snapshot: FinanceStatementSnapshot): {
  filename: string;
  asciiFilename: string;
} {
  const prefix = snapshot.brandKey === "ELITE" ? "Diamond-Elite-Statement" : "Diamond-Unique-Statement";
  const range = `${snapshot.periodLabel.from}_to_${snapshot.periodLabel.to}`;
  const filename = `${prefix}-${range}.pdf`;
  return { filename, asciiFilename: filename };
}
