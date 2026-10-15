import { computeInitialDialogZoom } from "./document-alignment-profiles.ts";
import {
  DEFAULT_ALIGNMENT_TRANSFORM,
  type DocumentAlignmentTransform,
  type ViewportSize,
} from "./document-alignment.types.ts";

/** Transform applied when the alignment dialog opens (restore prior edit or fresh contain zoom). */
export function openTransformForDialog(
  restored: DocumentAlignmentTransform | null | undefined,
  viewport: ViewportSize,
  source: { width: number; height: number },
): DocumentAlignmentTransform {
  if (restored) {
    return { ...restored };
  }
  const rawZoom = computeInitialDialogZoom(viewport, source);
  const zoom = Math.min(4, Math.max(0.35, rawZoom));
  return { ...DEFAULT_ALIGNMENT_TRANSFORM, zoom };
}
