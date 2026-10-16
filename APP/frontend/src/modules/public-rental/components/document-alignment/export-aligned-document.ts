import { clampImageAdjustmentPercent } from "./alignment-image-controls";
import { clampRotation, documentAlignmentProfile } from "./document-alignment-profiles";
import {
  ALIGNMENT_COMPOSITION_BACKGROUND,
  composeAlignmentViewport,
  computeDisplayScale,
  computeExportPixelRatio,
  guideRectForKind,
} from "./alignment-composition";
import type {
  DocumentAlignmentKind,
  DocumentAlignmentTransform,
  ViewportSize,
} from "./document-alignment.types";

export async function loadImageSource(file: File): Promise<{
  image: CanvasImageSource & { width: number; height: number };
  release: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      image: bitmap,
      release: () => bitmap.close(),
    };
  }
  const url = URL.createObjectURL(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode_failed"));
    img.src = url;
  });
  return {
    image,
    release: () => URL.revokeObjectURL(url),
  };
}

function outputMimeForSource(file: File): { mime: "image/png" | "image/jpeg"; quality?: number } {
  if (file.type === "image/png") return { mime: "image/png" };
  return { mime: "image/jpeg", quality: 0.92 };
}

function outputFilename(originalName: string, mime: string): string {
  const base = originalName.replace(/\.[^.]+$/, "") || "document";
  const ext = mime === "image/jpeg" ? ".jpg" : ".png";
  return `${base}${ext}`;
}

export interface ExportAlignedDocumentInput {
  kind: DocumentAlignmentKind;
  file: File;
  transform: DocumentAlignmentTransform;
  viewport: ViewportSize;
}

/**
 * WYSIWYG export: render the preview viewport (same pan/zoom/rotate), then crop the guide rect.
 */
export async function exportAlignedDocument(input: ExportAlignedDocumentInput): Promise<File> {
  const profile = documentAlignmentProfile(input.kind);
  const transform = {
    ...input.transform,
    rotationDeg: clampRotation(input.transform.rotationDeg, profile),
    brightnessPercent: clampImageAdjustmentPercent(input.transform.brightnessPercent ?? 100),
    contrastPercent: clampImageAdjustmentPercent(input.transform.contrastPercent ?? 100),
  };
  const { image, release } = await loadImageSource(input.file);
  try {
    const sw = image.width;
    const sh = image.height;
    const displayScale = computeDisplayScale(input.viewport, { width: sw, height: sh }, transform.zoom);
    const displayW = sw * displayScale;
    const displayH = sh * displayScale;
    const pixelRatio = computeExportPixelRatio({ width: sw, height: sh }, displayW, displayH);
    const guide = guideRectForKind(input.viewport, input.kind);

    const vpW = Math.max(1, Math.ceil(input.viewport.width * pixelRatio));
    const vpH = Math.max(1, Math.ceil(input.viewport.height * pixelRatio));

    const viewportCanvas = document.createElement("canvas");
    viewportCanvas.width = vpW;
    viewportCanvas.height = vpH;
    const vpCtx = viewportCanvas.getContext("2d");
    if (!vpCtx) throw new Error("canvas_unavailable");

    vpCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    composeAlignmentViewport(vpCtx, {
      kind: input.kind,
      viewport: input.viewport,
      source: { width: sw, height: sh },
      transform,
      image,
    });
    vpCtx.setTransform(1, 0, 0, 1, 0, 0);

    const cropX = Math.floor(guide.left * pixelRatio);
    const cropY = Math.floor(guide.top * pixelRatio);
    const cropW = Math.max(1, Math.ceil(guide.width * pixelRatio));
    const cropH = Math.max(1, Math.ceil(guide.height * pixelRatio));

    const canvas = document.createElement("canvas");
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unavailable");

    ctx.fillStyle = ALIGNMENT_COMPOSITION_BACKGROUND;
    ctx.fillRect(0, 0, cropW, cropH);
    ctx.drawImage(viewportCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    const { mime, quality } = outputMimeForSource(input.file);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("export_failed"))),
        mime,
        quality,
      );
    });
    return new File([blob], outputFilename(input.file.name, mime), { type: mime });
  } finally {
    release();
  }
}
