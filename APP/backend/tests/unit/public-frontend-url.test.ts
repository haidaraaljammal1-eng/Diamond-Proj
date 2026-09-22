import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPublicFrontendUrl,
  normalizePublicLocale,
  publicLocaleFromAcceptLanguage,
} from "src/lib/http/public-frontend-url";

test("normalizePublicLocale defaults to en and accepts ar", () => {
  assert.equal(normalizePublicLocale(undefined), "en");
  assert.equal(normalizePublicLocale("en-US"), "en");
  assert.equal(normalizePublicLocale("ar"), "ar");
  assert.equal(normalizePublicLocale("ar-AE"), "ar");
});

test("publicLocaleFromAcceptLanguage reads the first language tag", () => {
  assert.equal(publicLocaleFromAcceptLanguage("ar-AE,en;q=0.9"), "ar");
  assert.equal(publicLocaleFromAcceptLanguage("en-GB,ar;q=0.8"), "en");
  assert.equal(publicLocaleFromAcceptLanguage(["ar-AE", "en"]), "ar");
});

test("buildPublicFrontendUrl prefixes locale and encodes query params", () => {
  const url = buildPublicFrontendUrl("ar", "/rental/token-1", { card: "cancelled" });
  assert.match(url, /\/ar\/rental\/token-1\?card=cancelled$/);
});
