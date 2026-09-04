import { test } from "node:test";
import assert from "node:assert/strict";
import { SaveConfigSchema, SendTestSchema, KindParamsSchema } from "src/modules/integrations/integration-config.schema";

test("SaveConfigSchema accepts config + secrets maps", () => {
  const parsed = SaveConfigSchema.parse({ config: { smtpHost: "smtp.x.io" }, secrets: { password: "p" }, enabled: true });
  assert.equal(parsed.config.smtpHost, "smtp.x.io");
  assert.equal(parsed.secrets.password, "p");
});
test("SaveConfigSchema defaults secrets/config to empty objects", () => {
  const parsed = SaveConfigSchema.parse({});
  assert.deepEqual(parsed.config, {});
  assert.deepEqual(parsed.secrets, {});
});
test("SendTestSchema requires a non-empty recipient", () => {
  assert.throws(() => SendTestSchema.parse({ to: "" }));
  assert.equal(SendTestSchema.parse({ to: "user@x.io" }).to, "user@x.io");
});
test("KindParamsSchema accepts valid CatalogKind values", () => {
  const validKinds = ["WHATSAPP", "SMS", "EMAIL", "SSO_ACTIVE_DIRECTORY", "POWER_BI"];
  validKinds.forEach((kind) => {
    const parsed = KindParamsSchema.parse({ kind });
    assert.equal(parsed.kind, kind);
  });
});
test("KindParamsSchema rejects invalid kind values", () => {
  assert.throws(() => KindParamsSchema.parse({ kind: "INVALID_KIND" }));
});
