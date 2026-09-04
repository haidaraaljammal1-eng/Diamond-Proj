import PDFDocument from "pdfkit";
import type { Language } from "src/config/i18n";
import { registerReportFonts, REPORT_FONT_REGULAR, REPORT_FONT_BOLD } from "src/modules/reports/report-fonts";
import { renderRtlText, wrapText, type BaseDirection } from "src/modules/reports/report-rtl";
import { reportLabels } from "src/modules/reports/report-localization";
import { formatCell, isNumericColumn, EMPTY_CELL } from "src/modules/reports/report-format";
import type { ReportCell, ReportCellType } from "src/modules/reports/report-model";
import { reportPdfRenderFailedError } from "src/modules/reports/reports.errors";

export interface PdfColumn {
  label: string;
  type: ReportCellType;
  width?: number;
}
export interface PdfTable {
  title: string;
  columns: PdfColumn[];
  rows: ReportCell[][];
}
export interface PdfKpi {
  label: string;
  type: ReportCellType;
  value: number | null;
}
export interface ReportRenderInput {
  title: string;
  description?: string;
  periodLabel: string;
  generatedAt: Date;
  scopeLabel: string;
  filtersLabel?: string;
  kpis?: PdfKpi[];
  tables: PdfTable[];
  locale: Language;
  /** Business timezone offset in minutes (dates are rendered in it). */
  offsetMinutes?: number;
}

const MARGIN = 40;
const GRAY = "#555";
const INK = "#111";
const LINE = "#d5d5d5";
const HEADER_BG = "#f2f2f2";
const FOOTER_SPACE = 22;
/** More columns than this and the page flips to landscape (prompt §19). */
const LANDSCAPE_THRESHOLD = 6;

/**
 * Server-generated report PDF (PDFKit, no browser) with full Arabic support: an
 * embedded Arabic font, contextual shaping, Unicode bidi ordering and RTL layout
 * (see report-rtl.ts). Latin/numeric content (codes, percentages, dates) is never
 * reversed. `locale` drives base direction and label language.
 *
 * Layout guarantees (prompt §19):
 *   - report name / period / scope / filters / generated-at header block
 *   - KPI strip when the report has headline numbers
 *   - the header ROW of a table is repeated on every page the table spills onto
 *   - "صفحة x من y" footer on every page
 *   - landscape orientation for wide tables so no column falls off the page
 */
export function renderReportPdf(input: ReportRenderInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const baseDir: BaseDirection = input.locale === "ar" ? "rtl" : "ltr";
      const labels = reportLabels(input.locale);
      const offset = input.offsetMinutes ?? 180;
      const widest = input.tables.reduce((n, t) => Math.max(n, t.columns.length), 0);
      const landscape = widest > LANDSCAPE_THRESHOLD;

      const doc = new PDFDocument({
        margin: MARGIN,
        size: "A4",
        layout: landscape ? "landscape" : "portrait",
        info: { Title: input.title },
        bufferPages: true,
      });
      registerReportFonts(doc);
      doc.font(REPORT_FONT_REGULAR);

      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const left = MARGIN;
      const contentWidth = doc.page.width - MARGIN * 2;
      const pageBottom = doc.page.height - MARGIN - FOOTER_SPACE;
      let y = MARGIN;

      const newPage = () => {
        doc.addPage();
        y = MARGIN;
      };
      const line = (
        text: string,
        opts: { font?: string; size?: number; color?: string; gap?: number } = {},
      ) => {
        doc.font(opts.font ?? REPORT_FONT_REGULAR).fontSize(opts.size ?? 10).fillColor(opts.color ?? INK);
        if (y + doc.currentLineHeight() + (opts.gap ?? 2) > pageBottom) newPage();
        y = renderRtlText(doc, text, left, y, contentWidth, { baseDir, align: "start" });
      };

      // ── Header block ────────────────────────────────────────────────────────
      line(input.title, { font: REPORT_FONT_BOLD, size: 18, gap: 6 });
      if (input.description) line(input.description, { color: GRAY, size: 9 });
      y += 4;
      line(`${labels.period}: ${input.periodLabel}`, { color: GRAY });
      line(`${labels.scope}: ${input.scopeLabel}`, { color: GRAY });
      if (input.filtersLabel) line(`${labels.filters}: ${input.filtersLabel}`, { color: GRAY });
      line(`${labels.generatedAt}: ${formatCell(input.generatedAt, "DATETIME", offset)}`, { color: GRAY });
      const totalRows = input.tables.reduce((n, t) => n + t.rows.length, 0);
      line(`${labels.results}: ${totalRows}`, { color: GRAY });
      y += 8;

      // ── KPI strip ───────────────────────────────────────────────────────────
      const kpis = input.kpis ?? [];
      if (kpis.length > 0) {
        const perRow = Math.min(4, kpis.length);
        const boxW = contentWidth / perRow;
        const boxH = 44;
        for (let i = 0; i < kpis.length; i += perRow) {
          const slice = kpis.slice(i, i + perRow);
          if (y + boxH > pageBottom) newPage();
          const top = y;
          slice.forEach((k, idx) => {
            // RTL: first KPI at the right edge.
            const x = baseDir === "rtl" ? left + contentWidth - (idx + 1) * boxW : left + idx * boxW;
            doc.rect(x, top, boxW, boxH).strokeColor(LINE).lineWidth(0.5).stroke();
            doc.font(REPORT_FONT_REGULAR).fontSize(8).fillColor(GRAY);
            renderRtlText(doc, k.label, x + 6, top + 6, boxW - 12, { baseDir, align: "start", noWrap: true });
            doc.font(REPORT_FONT_BOLD).fontSize(14).fillColor(INK);
            const value = k.value == null ? EMPTY_CELL : formatCell(k.value, k.type, offset);
            renderRtlText(doc, value, x + 6, top + 22, boxW - 12, { baseDir, align: "start", noWrap: true });
          });
          y = top + boxH + 6;
        }
        y += 4;
      }

      // ── Tables ──────────────────────────────────────────────────────────────
      for (const table of input.tables) {
        if (y + 60 > pageBottom) newPage();
        y += 6;
        line(table.title, { font: REPORT_FONT_BOLD, size: 13, gap: 4 });

        const weights = table.columns.map((c) => c.width ?? 14);
        const weightSum = weights.reduce((a, w) => a + w, 0) || 1;
        const widths = weights.map((w) => (w / weightSum) * contentWidth);
        const widthAt = (i: number) => widths[i] ?? 0;
        // RTL: first column at the right edge; LTR: first column at the left.
        const colX = (i: number) => {
          const before = widths.slice(0, i).reduce((a, w) => a + w, 0);
          return baseDir === "rtl" ? left + contentWidth - before - widthAt(i) : left + before;
        };
        const PAD = 4;

        const measure = (texts: string[], header: boolean) => {
          doc.font(header ? REPORT_FONT_BOLD : REPORT_FONT_REGULAR).fontSize(header ? 9 : 8.5);
          const lineH = doc.currentLineHeight();
          return Math.max(1, ...texts.map((t, i) => wrapText(doc, t, widthAt(i) - PAD * 2).length)) * lineH + PAD * 2;
        };
        const draw = (texts: string[], header: boolean, height: number) => {
          const top = y;
          if (header) doc.rect(left, top, contentWidth, height).fillColor(HEADER_BG).fill();
          doc.font(header ? REPORT_FONT_BOLD : REPORT_FONT_REGULAR).fontSize(header ? 9 : 8.5).fillColor(INK);
          texts.forEach((t, i) => {
            const align = isNumericColumn(table.columns[i]?.type ?? "TEXT") ? "end" : "start";
            renderRtlText(doc, t, colX(i) + PAD, top + PAD, widthAt(i) - PAD * 2, { baseDir, align });
          });
          doc.rect(left, top, contentWidth, height).strokeColor(LINE).lineWidth(0.5).stroke();
          y = top + height;
        };

        const headerTexts = table.columns.map((c) => c.label);
        const headerHeight = measure(headerTexts, true);
        const drawHeader = () => draw(headerTexts, true, headerHeight);

        if (y + headerHeight > pageBottom) newPage();
        drawHeader();

        if (table.rows.length === 0) {
          doc.font(REPORT_FONT_REGULAR).fontSize(9).fillColor(GRAY);
          y = renderRtlText(doc, labels.empty, left + PAD, y + PAD, contentWidth - PAD * 2, { baseDir, align: "start" }) + PAD;
        }

        for (const row of table.rows) {
          const texts = row.map((cell, i) => formatCell(cell, table.columns[i]?.type ?? "TEXT", offset));
          const height = measure(texts, false);
          if (y + height > pageBottom) {
            newPage();
            // The header row REPEATS on every page the table continues onto (§19).
            drawHeader();
          }
          draw(texts, false, height);
        }
        y += 6;
      }

      // ── Footer: "صفحة x من y" on every page ─────────────────────────────────
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        doc.font(REPORT_FONT_REGULAR).fontSize(8).fillColor(GRAY);
        const footerY = doc.page.height - MARGIN - 10;
        renderRtlText(
          doc,
          `${labels.page} ${i + 1} ${labels.of} ${range.count}`,
          left,
          footerY,
          doc.page.width - MARGIN * 2,
          { baseDir, align: "center", noWrap: true },
        );
      }

      doc.flushPages();
      doc.end();
    } catch (err) {
      reject(reportPdfRenderFailedError(err));
    }
  });
}
