import { Prisma } from "@prisma/client";
import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";

/** True when a Prisma error is a unique-constraint violation (P2002). */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Map known Prisma errors to a structured AppError. Returns null for anything
 * unrecognized so the caller can fall through to a generic 500 (never leaking
 * DB internals to clients).
 */
export function mapPrismaError(err: unknown): AppError | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return null;

  switch (err.code) {
    case "P2002":
      return new AppError({
        code: ErrorCode.CONFLICT,
        message: "A conflicting resource already exists",
        context: { fields: (err.meta?.target as string[] | undefined) ?? undefined },
      });
    case "P2025":
      return new AppError({ code: ErrorCode.NOT_FOUND, message: "Resource not found" });
    case "P2003":
      return new AppError({
        code: ErrorCode.CONFLICT,
        message: "A conflicting resource already exists",
      });
    default:
      return null;
  }
}
