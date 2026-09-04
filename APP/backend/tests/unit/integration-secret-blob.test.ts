import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptSecretBlob, decryptSecretBlob, mergeSecrets, maskSecret, secretHints } from "src/modules/integrations/secret-blob";
import { encryptSecret } from "src/lib/security/encryption";

test("encrypt then decrypt round-trips the blob", () => {
  const blob = { password: "s3cr3t-value", apiKey: "abcd1234" };
  const cipher = encryptSecretBlob(blob);
  assert.notEqual(cipher, JSON.stringify(blob)); // not plaintext
  assert.deepEqual(decryptSecretBlob(cipher), blob);
});

test("decrypt of null returns empty object", () => {
  assert.deepEqual(decryptSecretBlob(null), {});
});

test("mergeSecrets keeps existing when incoming is blank/undefined, overwrites otherwise", () => {
  const merged = mergeSecrets({ password: "old", apiKey: "keepme" }, { password: "new", apiKey: "" });
  assert.deepEqual(merged, { password: "new", apiKey: "keepme" });
});

test("maskSecret reveals only the last 4 chars, never the whole secret", () => {
  assert.equal(maskSecret("supersecreta82f"), "••••a82f");
  assert.equal(maskSecret("ab"), "••••");     // short secret fully hidden
  assert.equal(maskSecret("abcd"), "••••");   // exactly 4 -> nothing revealed
  assert.equal(maskSecret(""), "••••");
});

test("secretHints masks every stored secret", () => {
  assert.deepEqual(secretHints({ password: "abcd1234", apiKey: "zzzz9999" }), {
    password: "••••1234", apiKey: "••••9999",
  });
});

test("decryptSecretBlob returns {} on malformed ciphertext without throwing", () => {
  assert.deepEqual(decryptSecretBlob("not-valid-ciphertext"), {});
  assert.deepEqual(decryptSecretBlob(""), {});
});

test("empty blob round-trips to {}", () => {
  assert.deepEqual(decryptSecretBlob(encryptSecretBlob({})), {});
});

test("decryptSecretBlob tolerates legacy raw single-secret string -> { password }", () => {
  const legacy = encryptSecret("my-smtp-password"); // stored the old way (not a JSON blob)
  assert.deepEqual(decryptSecretBlob(legacy), { password: "my-smtp-password" });
});

test("decryptSecretBlob still returns a JSON blob object unchanged", () => {
  const blob = encryptSecretBlob({ password: "p", apiKey: "k" });
  assert.deepEqual(decryptSecretBlob(blob), { password: "p", apiKey: "k" });
});
