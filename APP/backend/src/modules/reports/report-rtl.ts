import bidiFactory, { type Bidi } from "bidi-js";
import type PDFDocument from "pdfkit";

/**
 * Server-side bidirectional (Arabic RTL) text layout for PDFKit.
 *
 * PDFKit + fontkit shape Arabic glyphs correctly (contextual joining) and reverse
 * a single right-to-left script run, but they do NOT implement the Unicode
 * Bidirectional Algorithm: mixed Arabic/Latin/number strings get one script/one
 * direction for the whole string, which reverses numbers ("84%" -> "%48") and
 * mis-orders runs. This module fills that gap:
 *
 *  1. Compute UBA embedding levels with `bidi-js` (a real UBA implementation).
 *  2. Coalesce number tokens (e.g. "+48", "84%", "2.4") into a single left-to-right
 *     unit so signs/percent stay glued to their digits and never reverse.
 *  3. Reorder into visual runs (bidi L2) while keeping each run's characters in
 *     LOGICAL order — fontkit then shapes and reverses each run correctly.
 *  4. Apply bracket mirroring (bidi L4) for RTL runs.
 *  5. Render each run with `features: []`, which forces PDFKit's whole-string
 *     fontkit layout path (the default path splits on spaces and drops/misplaces
 *     inter-word spaces in RTL text).
 *
 * We never naively reverse strings; ordering comes from the UBA implementation.
 */

let bidiInstance: Bidi | null = null;
function bidi(): Bidi {
  return (bidiInstance ??= bidiFactory());
}

// A number token: optional sign, a digit, then digits/number separators, optional
// trailing percent. Signs/percent/decimal separators stay attached to the digits.
const NUMBER_TOKEN = /[+\-−]?\d[\d.,:/٫٬٠-٩]*%?/g;

/** Force number-token characters to an even (LTR) level so signs stay glued to digits. */
function overrideNumberTokens(text: string, levels: Uint8Array): void {
  for (const m of text.matchAll(NUMBER_TOKEN)) {
    const start = m.index ?? 0;
    for (let i = start; i < start + m[0].length; i++) {
      const lvl = levels[i] ?? 0;
      levels[i] = lvl + (lvl % 2); // odd -> even (LTR); even unchanged
    }
  }
}

export interface VisualRun {
  text: string;
  rtl: boolean;
}

export type BaseDirection = "rtl" | "ltr";

/**
 * Split a single line into visual-order runs. Each run keeps its characters in
 * LOGICAL order (fontkit shapes + reverses RTL runs on render). Bracket glyphs in
 * RTL runs are mirrored.
 */
export function visualRuns(text: string, baseDir: BaseDirection): VisualRun[] {
  if (text.length === 0) return [];
  const b = bidi();
  const embedding = b.getEmbeddingLevels(text, baseDir);
  const levels = embedding.levels;
  overrideNumberTokens(text, levels);
  const mirror = b.getMirroredCharactersMap(text, levels);
  const charAt = (k: number): string => mirror.get(k) ?? text[k] ?? "";
  const levelAt = (logicalIndex: number): number => levels[logicalIndex] ?? 0;
  const visual = b.getReorderedIndices(text, embedding); // visual -> logical (char level)

  const runs: VisualRun[] = [];
  let i = 0;
  while (i < visual.length) {
    const level = levelAt(visual[i] ?? 0);
    let j = i;
    while (j < visual.length && levelAt(visual[j] ?? 0) === level) j++;
    let idxs = visual.slice(i, j);
    const rtl = (level & 1) === 1;
    if (rtl) idxs = idxs.reverse(); // visual -> logical for an RTL run
    runs.push({ text: idxs.map(charAt).join(""), rtl });
    i = j;
  }
  return runs;
}

// Arabic, Arabic Supplement, Arabic Extended-A, and the two Presentation Forms blocks.
// Escaped (not literal) to avoid embedding irregular-whitespace codepoints in source.
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC]/;
/** True when the string contains any Arabic-script character. */
export function hasArabic(text: string): boolean {
  return ARABIC_RE.test(text);
}

type Doc = InstanceType<typeof PDFDocument>;

/** Greedy word-wrap in logical order. Exported so callers can pre-measure row height. */
export function wrapText(doc: Doc, text: string, maxWidth: number): string[] {
  const tokens = text.split(/(\s+)/).filter((w) => w.length);
  const lines: string[] = [];
  let cur = "";
  for (const w of tokens) {
    const test = cur + w;
    if (cur && doc.widthOfString(test.trim(), { features: [] }) > maxWidth) {
      lines.push(cur.trim());
      cur = w.trimStart();
    } else {
      cur = test;
    }
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines.length ? lines : [""];
}

export interface RtlTextOptions {
  baseDir?: BaseDirection;
  align?: "start" | "end" | "center";
  lineGap?: number;
  noWrap?: boolean;
}

/**
 * Render bidirectional text into `[x, x + width]` starting at `y`, wrapping as needed.
 * `align: "start"` is right for RTL / left for LTR. Returns the y position after the block.
 */
export function renderRtlText(
  doc: Doc,
  text: string,
  x: number,
  y: number,
  width: number,
  opts: RtlTextOptions = {},
): number {
  const baseDir: BaseDirection = opts.baseDir ?? "rtl";
  const align = opts.align ?? "start";
  const lineGap = opts.lineGap ?? 2;
  const lineHeight = doc.currentLineHeight() + lineGap;
  const lines = opts.noWrap ? [text] : wrapText(doc, text, width);
  let cursorY = y;
  for (const line of lines) {
    const runs = visualRuns(line, baseDir);
    const widths = runs.map((r) => doc.widthOfString(r.text, { features: [] }));
    const total = widths.reduce((a, w) => a + w, 0);
    const alignedRight = align === "end" ? baseDir === "ltr" : baseDir === "rtl";
    let cx: number;
    if (align === "center") cx = x + (width - total) / 2;
    else if (alignedRight) cx = x + Math.max(0, width - total);
    else cx = x;
    runs.forEach((r, k) => {
      doc.text(r.text, cx, cursorY, { lineBreak: false, features: [] });
      cx += widths[k] ?? 0;
    });
    cursorY += lineHeight;
  }
  return cursorY;
}

/** Measured visual width of a single (unwrapped) line. */
export function measureLine(doc: Doc, text: string, baseDir: BaseDirection = "rtl"): number {
  return visualRuns(text, baseDir).reduce((w, r) => w + doc.widthOfString(r.text, { features: [] }), 0);
}
