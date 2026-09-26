import { env } from "src/config/env";
import { verifyContentType } from "src/lib/files/magic-bytes";
import { VisionAIError } from "src/modules/vision-ai/vision-ai.errors";

const VISION_AI_IMAGE_MIME = new Set(["image/png", "image/jpeg"]);

export function assertVisionAiImageInput(bytes: Buffer, mimeType: string): void {
  const declared = mimeType.trim().toLowerCase();
  if (!VISION_AI_IMAGE_MIME.has(declared)) {
    throw new VisionAIError("VISION_AI_INVALID_IMAGE", "Unsupported image type for Vision AI");
  }
  if (bytes.length === 0 || bytes.length > env.MAX_UPLOAD_SIZE) {
    throw new VisionAIError("VISION_AI_INVALID_IMAGE", "Image size is outside allowed limits");
  }
  const verified = verifyContentType(bytes, declared);
  if (!verified.ok) {
    throw new VisionAIError("VISION_AI_INVALID_IMAGE", "Image content does not match declared type");
  }
}
