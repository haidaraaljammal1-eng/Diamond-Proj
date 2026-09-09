import { z } from "zod";
import "dotenv/config";

/**
 * Environment validation. Startup FAILS FAST when a required variable is
 * missing or invalid. No production security value is hardcoded in business
 * code — everything security-relevant is sourced from here.
 */

const csv = (value: string): string[] =>
  value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** Env booleans: only "true"/"1" are truthy. `z.coerce.boolean` is unsafe here. */
const envBool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : v === "true" || v === "1"));

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),
    JWT_REFRESH_SECRET: z
      .string()
      .min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),
    COOKIE_SECRET: z.string().min(32, "COOKIE_SECRET must be at least 32 chars"),
    // Dedicated key for TOTP secrets at rest. Deliberately NOT derived from
    // COOKIE_SECRET: rotating a cookie/session secret must not lock every user
    // out of their authenticator.
    TWO_FACTOR_ENCRYPTION_KEY: z
      .string()
      .min(32, "TWO_FACTOR_ENCRYPTION_KEY must be at least 32 chars"),

    ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(604800),
    REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(2592000),
    ACCOUNT_SETUP_TOKEN_TTL: z.coerce.number().int().positive().default(86400),
    PASSWORD_RESET_TOKEN_TTL: z.coerce.number().int().positive().default(3600),
    // Lifetime of the post-password, pre-2FA login challenge.
    TWO_FACTOR_CHALLENGE_TTL: z.coerce.number().int().positive().default(300),
    // How long a started-but-unconfirmed enrolment stays valid.
    TWO_FACTOR_SETUP_TTL: z.coerce.number().int().positive().default(600),
    // Per-challenge verification attempts before the challenge is burned.
    TWO_FACTOR_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    TWO_FACTOR_RECOVERY_CODE_COUNT: z.coerce.number().int().positive().default(10),
    // Shown as the account issuer inside the user's authenticator app.
    TWO_FACTOR_ISSUER: z.string().trim().min(1).default("Enterprise Starter"),

    CORS_ORIGINS: z.string().default("").transform(csv),
    FRONTEND_URL: z.string().default("http://localhost:5173"),

    // In-process distribution scheduler (see src/plugins/scheduler.ts). ON by
    // default so a single-container deployment drives the automatic flow with no
    // separate worker. Set to false on API replicas ONLY when a dedicated
    // dedicated background worker process runs the cycles instead.
    SCHEDULER_ENABLED: envBool(true),
    SCHEDULER_POLL_MS: z.coerce.number().int().positive().default(30_000),

    RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_GLOBAL_WINDOW: z.coerce.number().int().positive().default(60000),
    RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(5),
    RATE_LIMIT_AUTH_WINDOW: z.coerce.number().int().positive().default(60000),

    FILE_STORAGE_DIR: z.string().default("./uploads"),
    MAX_UPLOAD_SIZE: z.coerce.number().int().positive().default(5_242_880),
    ALLOWED_UPLOAD_MIME: z
      .string()
      .default("image/png,image/jpeg,application/pdf")
      .transform(csv),

    OFFICE_DISPLAY_NAME: z.string().trim().min(1).default("Diamond Rent Car"),
    // Asia/Dubai (UTC+4, no DST). License expiry uses this offset, not the client clock.
    BUSINESS_TIMEZONE_OFFSET_MINUTES: z.coerce.number().int().default(240),
    DOCUMENT_OCR_PROVIDER: z.enum(["none", "azure"]).default("none"),
    AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: z.string().optional().default(""),
    AZURE_DOCUMENT_INTELLIGENCE_KEY: z.string().optional().default(""),
    DOCUMENT_OCR_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.8),
    PAYMENT_PROVIDER: z.enum(["none", "stripe"]).default("none"),
    STRIPE_SECRET_KEY: z.string().optional().default(""),
    STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),
    STRIPE_PUBLISHABLE_KEY: z.string().optional().default(""),

    // TARS mandatory-procedure integration. There is no official TARS API
    // documentation yet, so this flag only expresses intent — no adapter,
    // endpoint, credential or payload contract is assumed. Execution stays
    // fail-closed (TARS_NOT_CONFIGURED) until a real TarsApiProvider exists.
    TARS_ENABLED: envBool(false),

    EMAIL_ENABLED: envBool(false),
    SMTP_HOST: z.string().optional().default(""),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: envBool(false),
    SMTP_USER: z.string().optional().default(""),
    SMTP_PASSWORD: z.string().optional().default(""),
    SMTP_FROM: z.string().default("no-reply@example.com"),
    /**
     * NON-PRODUCTION recipient allowlist (CSV). When set, an outbound email whose
     * recipient is not listed is SKIPPED before the SMTP transport is touched, so
     * a dev/test run against live SMTP credentials cannot mail a real customer.
     *
     * Entries are either a full address ("qa@example.test") or a whole domain
     * ("@example.test"). Matching is case-insensitive.
     *
     * Deliberately inert in production and inert when unset: leaving it empty
     * preserves today's behaviour exactly.
     */
    EMAIL_RECIPIENT_ALLOWLIST: z.string().optional().default("").transform(csv),

    SEED_DEV_ADMIN: envBool(false),
    DEV_ADMIN_EMAIL: z.string().default("admin@example.com"),
    DEV_ADMIN_PASSWORD: z.string().optional().default(""),
  })
  .superRefine((val, ctx) => {
    if (val.EMAIL_ENABLED && !val.SMTP_HOST) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_HOST"],
        message: "SMTP_HOST is required when EMAIL_ENABLED=true",
      });
    }
    if (val.NODE_ENV === "production") {
      for (const key of [
        "JWT_ACCESS_SECRET",
        "JWT_REFRESH_SECRET",
        "COOKIE_SECRET",
        "TWO_FACTOR_ENCRYPTION_KEY",
      ] as const) {
        if (val[key].includes("replace-with")) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} still uses the example placeholder value in production`,
          });
        }
      }
      if (val.CORS_ORIGINS.includes("*")) {
        ctx.addIssue({
          code: "custom",
          path: ["CORS_ORIGINS"],
          message: 'CORS_ORIGINS must not contain "*" in production',
        });
      }
      if (val.SEED_DEV_ADMIN) {
        ctx.addIssue({
          code: "custom",
          path: ["SEED_DEV_ADMIN"],
          message: "SEED_DEV_ADMIN must be false in production",
        });
      }
    }
    if (val.SEED_DEV_ADMIN && !val.DEV_ADMIN_PASSWORD) {
      ctx.addIssue({
        code: "custom",
        path: ["DEV_ADMIN_PASSWORD"],
        message: "DEV_ADMIN_PASSWORD is required when SEED_DEV_ADMIN=true",
      });
    }
  });

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map(
    (issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`,
  );

  console.error(`\nInvalid environment configuration:\n${lines.join("\n")}\n`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";
