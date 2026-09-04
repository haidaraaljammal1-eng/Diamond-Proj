import type { FastifyInstance } from "fastify";
import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";

const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Authentication hook. Verifies the short-lived access token and attaches a
 * READ-ONLY identity to `request.auth`. The hot path performs a single SELECT
 * (never a write); the lastSeen update is throttled and fire-and-forget so
 * authentication never blocks on (or churns) the database.
 *
 * Runs at `preValidation`, i.e. BEFORE schema validation — deliberately, not by
 * accident. At `preHandler` (after validation) an ANONYMOUS caller who posted a
 * malformed body got a 422 listing every field of the request schema instead of
 * a 401, handing the API's shape to someone holding no credentials. Auth is the
 * first question; "is this body well-formed" is only asked of callers who have
 * already answered it.
 *
 * This hook is only ever registered inside the authenticated access-level scopes
 * (`routes/user/…`, `routes/admin/…` — see src/plugins/autoload.ts), so routes
 * under `routes/public/…` are untouched and still validate anonymous bodies
 * normally. Authenticated callers are also unaffected: auth passes, then
 * validation runs exactly as before and a bad body is still a 422.
 */
export function verifyToken(fastify: FastifyInstance): void {
  fastify.addHook("preValidation", async (request) => {
    let payload: { sub: number; sid?: string };
    try {
      payload = await request.jwtVerify();
    } catch (err) {
      const marker = String(
        (err as { code?: string })?.code ?? (err as Error)?.message ?? "",
      );
      if (/expired/i.test(marker)) {
        throw new AppError({
          code: ErrorCode.TOKEN_EXPIRED,
          message: "Access token expired",
        });
      }
      throw new AppError({
        code: ErrorCode.TOKEN_INVALID,
        message: "Invalid or expired token",
      });
    }

    const user = await fastify.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        status: true,
        lastSeenAt: true,
        roles: {
          select: {
            role: {
              select: {
                key: true,
                permissions: { select: { permission: { select: { key: true } } } },
              },
            },
          },
        },
      },
    });

    if (!user) throw AppError.unauthorized("Invalid or expired token");
    if (user.status === "SUSPENDED") {
      throw new AppError({
        code: ErrorCode.ACCOUNT_SUSPENDED,
        message: "Account is suspended",
      });
    }
    if (user.status === "PENDING") {
      throw new AppError({
        code: ErrorCode.ACCOUNT_SETUP_REQUIRED,
        message: "Account setup is required",
      });
    }

    const permissions = [
      ...new Set(
        user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key)),
      ),
    ];

    request.auth = {
      id: user.id,
      email: user.email,
      status: user.status,
      permissions,
      roleKeys: user.roles.map((ur) => ur.role.key),
      sessionId: payload.sid,
    };

    maybeUpdateLastSeen(fastify, user.id, user.lastSeenAt);
  });
}

/** Throttled, non-blocking. Only writes when the last update is stale. */
function maybeUpdateLastSeen(
  fastify: FastifyInstance,
  userId: number,
  lastSeenAt: Date | null,
): void {
  const stale = !lastSeenAt || Date.now() - lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS;
  if (!stale) return;
  void fastify.prisma.user
    .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
    .catch(() => {
      /* best-effort telemetry — never affects the request */
    });
}
