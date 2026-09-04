import { existsSync } from "node:fs";
import path from "node:path";
import type PDFDocument from "pdfkit";

/**
 * Arabic-capable font embedded into report PDFs. IBM Plex Sans Arabic (SIL OFL 1.1)
 * covers Arabic + Latin + digits in one family, so mixed Arabic/English content is
 * rendered consistently. The .ttf files are bundled with the app (copied into dist
 * by `scripts/copy-assets.mjs` at build) and embedded into the PDF — never served.
 */
export const REPORT_FONT_REGULAR = "ReportArabic";
export const REPORT_FONT_BOLD = "ReportArabic-Bold";

// Resolves in both dev (tsx over src/) and prod (node over dist/, assets copied at build).
const FONT_DIR = path.join(__dirname, "assets", "fonts");
const REGULAR_FILE = path.join(FONT_DIR, "IBMPlexSansArabic-Regular.ttf");
const BOLD_FILE = path.join(FONT_DIR, "IBMPlexSansArabic-SemiBold.ttf");

export function reportFontPaths(): { regular: string; bold: string } {
  return { regular: REGULAR_FILE, bold: BOLD_FILE };
}

/** True when the bundled Arabic fonts are present on disk. */
export function reportFontsAvailable(): boolean {
  return existsSync(REGULAR_FILE) && existsSync(BOLD_FILE);
}

type Doc = InstanceType<typeof PDFDocument>;

/**
 * Register the embedded Arabic fonts on a PDFKit document. Throws if the bundled
 * font files are missing so the failure is explicit (never silently falls back to a
 * non-Arabic default font that would drop Arabic glyphs).
 */
export function registerReportFonts(doc: Doc): void {
  if (!reportFontsAvailable()) {
    throw new Error(`report Arabic fonts missing at ${FONT_DIR}`);
  }
  doc.registerFont(REPORT_FONT_REGULAR, REGULAR_FILE);
  doc.registerFont(REPORT_FONT_BOLD, BOLD_FILE);
}
