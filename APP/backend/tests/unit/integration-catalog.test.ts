import { test } from "node:test";
import assert from "node:assert/strict";
import { INTEGRATION_CATALOG, getDescriptor, secretFieldKeys, configFieldKeys } from "src/modules/integrations/catalog";

test("catalog has exactly the 5 managed kinds, no CRM/ERP/CUSTOM", () => {
  const kinds = INTEGRATION_CATALOG.map((d) => d.kind).sort();
  assert.deepEqual(kinds, ["EMAIL", "POWER_BI", "SMS", "SSO_ACTIVE_DIRECTORY", "WHATSAPP"]);
});

test("EMAIL descriptor: password is the only secret; smtp fields are config", () => {
  assert.deepEqual(secretFieldKeys("EMAIL"), ["password"]);
  assert.ok(configFieldKeys("EMAIL").includes("smtpHost"));
  assert.ok(configFieldKeys("EMAIL").includes("encryption"));
});

test("WHATSAPP has a provider field with meta_cloud + generic_instance options and conditional fields", () => {
  const d = getDescriptor("WHATSAPP");
  assert.equal(d.providerField, "provider");
  const provider = d.fields.find((f) => f.key === "provider");
  assert.deepEqual(provider?.options, ["meta_cloud", "generic_instance"]);
  const phoneId = d.fields.find((f) => f.key === "phoneNumberId");
  assert.deepEqual(phoneId?.showWhen, { field: "provider", equals: "meta_cloud" });
});

test("SSO exposes redirectUrl as a readonly field and clientSecret as secret", () => {
  const d = getDescriptor("SSO_ACTIVE_DIRECTORY");
  assert.equal(d.fields.find((f) => f.key === "redirectUrl")?.type, "readonly");
  assert.deepEqual(secretFieldKeys("SSO_ACTIVE_DIRECTORY"), ["clientSecret"]);
  assert.equal(d.supportsSendTest, false);
});

test("supportsSendTest true for EMAIL/WHATSAPP/SMS, false for SSO/POWER_BI", () => {
  assert.equal(getDescriptor("EMAIL").supportsSendTest, true);
  assert.equal(getDescriptor("WHATSAPP").supportsSendTest, true);
  assert.equal(getDescriptor("SMS").supportsSendTest, true);
  assert.equal(getDescriptor("POWER_BI").supportsSendTest, false);
});
