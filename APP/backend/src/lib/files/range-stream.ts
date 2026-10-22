import { createReadStream } from "node:fs";
import type { ReadStream } from "node:fs";
import type { FastifyReply } from "fastify";

export type ByteRange = { start: number; end: number };

const RANGE_RE = /^bytes=(\d*)-(\d*)$/;

/** Parse a single `Range: bytes=` header value. Returns null when the header is absent. */
export function parseByteRangeHeader(
  rangeHeader: string | undefined,
  fileSize: number,
): ByteRange | null | "invalid" {
  if (!rangeHeader) return null;
  const match = RANGE_RE.exec(rangeHeader.trim());
  if (!match) return "invalid";

  const [, startRaw, endRaw] = match;
  let start: number;
  let end: number;

  if (startRaw === "" && endRaw === "") return "invalid";

  if (startRaw === "") {
    const suffix = Number(endRaw);
    if (!Number.isFinite(suffix) || suffix <= 0) return "invalid";
    start = Math.max(fileSize - suffix, 0);
    end = fileSize - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === "" ? fileSize - 1 : Number(endRaw);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return "invalid";
  if (start < 0 || end < start || start >= fileSize) return "invalid";
  end = Math.min(end, fileSize - 1);
  return { start, end };
}

export function openFileByteRange(
  absolutePath: string,
  range: ByteRange | null,
): { stream: ReadStream; contentLength: number; statusCode: 200 | 206; contentRange?: string } {
  if (!range) {
    return {
      stream: createReadStream(absolutePath),
      contentLength: 0,
      statusCode: 200,
    };
  }

  const { start, end } = range;
  const contentLength = end - start + 1;
  return {
    stream: createReadStream(absolutePath, { start, end }),
    contentLength,
    statusCode: 206,
    contentRange: `bytes ${start}-${end}/`,
  };
}

export async function statFileSize(statFn: (path: string) => Promise<{ size: number }>, path: string): Promise<number> {
  const stat = await statFn(path);
  return stat.size;
}

export function sendRangedFile(
  reply: FastifyReply,
  opts: {
    mimeType: string;
    fileSize: number;
    range: ByteRange | null;
    stream: ReadStream;
    statusCode: 200 | 206;
    contentRange?: string;
    contentLength?: number;
    dispositionFilename: string;
  },
): FastifyReply {
  reply.header("Content-Type", opts.mimeType);
  reply.header("Accept-Ranges", "bytes");
  reply.header(
    "Content-Disposition",
    `inline; filename="${encodeURIComponent(opts.dispositionFilename)}"`,
  );

  if (opts.statusCode === 206 && opts.contentRange) {
    reply.header("Content-Range", `${opts.contentRange}${opts.fileSize}`);
    reply.header("Content-Length", String(opts.contentLength ?? 0));
    return reply.status(206).send(opts.stream);
  }

  reply.header("Content-Length", String(opts.fileSize));
  return reply.status(200).send(opts.stream);
}
