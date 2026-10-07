/** Decode image dimensions client-side (no upload, no OCR). */
export async function readLicenseImageMeta(
  file: File,
): Promise<{ width: number; height: number; mimeType: string; byteSize: number }> {
  const byteSize = file.size;
  const mimeType = file.type;
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    const width = bitmap.width;
    const height = bitmap.height;
    bitmap.close();
    return { width, height, mimeType, byteSize };
  }
  const url = URL.createObjectURL(file);
  try {
    const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("decode_failed"));
      img.src = url;
    });
    return { width: dims.width, height: dims.height, mimeType, byteSize };
  } finally {
    URL.revokeObjectURL(url);
  }
}
