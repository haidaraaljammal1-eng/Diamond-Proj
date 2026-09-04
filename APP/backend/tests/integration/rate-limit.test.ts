import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";

/**
 * Regression: the auth rate limiter must return a structured 429 RATE_LIMITED
 * envelope (with Retry-After), NEVER a 500 INTERNAL_ERROR.
 *
 * @fastify/rate-limit throws the `errorResponseBuilder` result into the global
 * error handler; that handler routes framework errors by `error.statusCode`, so
 * the builder must include one. Before the fix the builder returned a bare
 * `{ error }` object with no statusCode, so the handler fell through to the
 * 500 branch. See src/plugins/rate-limit.ts + src/lib/errors/error-handler.ts.
 *
 * Integration test — needs a reachable DB. Run with RUN_INTEGRATION=true.
 */
const RUN = process.env.RUN_INTEGRATION === "true";

if (!RUN) {
  test("rate-limit integration skipped (set RUN_INTEGRATION=true + a test DATABASE_URL)", {
    skip: true,
  });
} else {
  let app: FastifyInstance;
  let max = 5;

  before(async () => {
    const { buildApp } = await import("src/app");
    const { env } = await import("src/config/env");
    max = env.RATE_LIMIT_AUTH_MAX; // this app instance's own limiter budget
    app = await buildApp();
  });

  after(async () => {
    if (app) await app.close();
  });

  test("auth limiter returns 429 RATE_LIMITED (never 500) with Retry-After", async () => {
    const attempts = max + 4;
    const responses = [];
    for (let i = 0; i < attempts; i++) {
      responses.push(
        await app.inject({
          method: "POST",
          url: "/auth/login",
          payload: { email: "nobody-ratelimit@example.test", password: "x" },
        }),
      );
    }

    const limited = responses.filter((r) => r.statusCode === 429);
    assert.ok(
      limited.length > 0,
      `expected at least one 429 after ${attempts} attempts (max=${max})`,
    );

    for (const r of responses) {
      // No request may ever surface as a 500 under rate limiting.
      assert.notEqual(r.statusCode, 500, `unexpected 500 under rate limiting: ${r.body}`);
      // Every throttled response is a structured 429 RATE_LIMITED envelope.
      if (r.statusCode === 429) {
        assert.equal(r.json().error.code, "RATE_LIMITED", `429 body: ${r.body}`);
      }
    }

    const first429 = limited[0]!;
    assert.ok(
      first429.headers["retry-after"] != null,
      "429 response must carry a Retry-After header",
    );
  });
}
