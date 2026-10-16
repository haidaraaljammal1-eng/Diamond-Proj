import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAMERA_CAPTURE_ACCEPT,
  CAMERA_CAPTURE_ENVIRONMENT,
  createNewDocumentAlignmentSession,
  documentCameraInputAttributes,
  readCameraCaptureFile,
} from "./document-alignment-source.ts";

describe("document-alignment-source", () => {
  it("camera input uses image/* and capture=environment", () => {
    assert.equal(CAMERA_CAPTURE_ACCEPT, "image/*");
    assert.equal(CAMERA_CAPTURE_ENVIRONMENT, "environment");
    assert.deepEqual(documentCameraInputAttributes(), {
      accept: "image/*",
      capture: "environment",
    });
  });

  it("readCameraCaptureFile returns null when cancelled or empty", () => {
    assert.equal(readCameraCaptureFile(null), null);
    assert.equal(readCameraCaptureFile(undefined), null);
    assert.equal(readCameraCaptureFile({ length: 0, item: () => null } as unknown as FileList), null);
  });

  it("readCameraCaptureFile returns the first file when present", () => {
    const file = new File(["x"], "capture.jpg", { type: "image/jpeg" });
    const list = { 0: file, length: 1, item: (i: number) => (i === 0 ? file : null) } as unknown as FileList;
    assert.equal(readCameraCaptureFile(list), file);
  });

  it("new session resets transform and editable source for license and passport", () => {
    const file = new File(["x"], "doc.png", { type: "image/png" });
    for (const kind of ["license", "passport"] as const) {
      const session = createNewDocumentAlignmentSession(kind, file);
      assert.equal(session.kind, kind);
      assert.equal(session.file, file);
      assert.equal(session.lastTransform, null);
      assert.equal(session.hasEditableSource, false);
    }
  });
});
