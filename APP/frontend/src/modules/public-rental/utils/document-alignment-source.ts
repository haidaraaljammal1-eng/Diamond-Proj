import type { DocumentAlignmentKind } from "../components/document-alignment/document-alignment.types";

/** Native mobile camera picker — separate from gallery upload (`LICENSE_ACCEPT`). */
export const CAMERA_CAPTURE_ACCEPT = "image/*";
export const CAMERA_CAPTURE_ENVIRONMENT = "environment";

export function documentCameraInputAttributes(): {
  accept: string;
  capture: string;
} {
  return {
    accept: CAMERA_CAPTURE_ACCEPT,
    capture: CAMERA_CAPTURE_ENVIRONMENT,
  };
}

export type NewDocumentAlignmentSession = {
  kind: DocumentAlignmentKind;
  file: File;
  lastTransform: null;
  hasEditableSource: false;
};

/** New storage or camera file — fresh original, no carried transform (dialog opens next). */
export function createNewDocumentAlignmentSession(
  kind: DocumentAlignmentKind,
  file: File,
): NewDocumentAlignmentSession {
  return {
    kind,
    file,
    lastTransform: null,
    hasEditableSource: false,
  };
}

export function readCameraCaptureFile(files: FileList | null | undefined): File | null {
  const file = files?.[0];
  return file ?? null;
}
