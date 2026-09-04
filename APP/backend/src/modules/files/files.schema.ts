import { z } from "zod";

export const AttachmentSchema = z.object({
  id: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
  checksum: z.string().nullable(),
  uploadedById: z.number().int().nullable(),
  createdAt: z.date(),
});
export type AttachmentPublic = z.infer<typeof AttachmentSchema>;
