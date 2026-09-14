import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PERMISSIONS } from "src/constants/permissions";
import {
  classifyExactPhoneMatches,
  phoneDigitsForMatch,
} from "src/modules/whatsapp/whatsapp.customer-match";
import { WHATSAPP_AUDIT } from "src/modules/whatsapp/whatsapp.constants";

describe("whatsapp customer match", () => {
  it("reuses digit comparison after normalizePhone and does not guess country codes", () => {
    assert.equal(phoneDigitsForMatch("15551112222"), "15551112222");
    assert.equal(phoneDigitsForMatch("+15551112222"), "15551112222");
    assert.equal(phoneDigitsForMatch("1555 111 2222"), "15551112222");
    assert.notEqual(phoneDigitsForMatch("0501110000"), phoneDigitsForMatch("971501110000"));
    assert.equal(phoneDigitsForMatch(""), null);
  });

  it("classifies none / one / ambiguous without auto-selecting", () => {
    assert.equal(classifyExactPhoneMatches(0), "NO_MATCH");
    assert.equal(classifyExactPhoneMatches(1), "ONE_MATCH");
    assert.equal(classifyExactPhoneMatches(2), "AMBIGUOUS");
  });

  it("seeds a distinct link permission and audit actions without message content keys", () => {
    assert.equal(PERMISSIONS.WHATSAPP_LINK_CUSTOMER, "whatsapp.link_customer");
    assert.notEqual(PERMISSIONS.WHATSAPP_LINK_CUSTOMER, PERMISSIONS.WHATSAPP_READ);
    assert.equal(WHATSAPP_AUDIT.CUSTOMER_LINKED, "WHATSAPP_CUSTOMER_LINKED");
    assert.equal(WHATSAPP_AUDIT.CUSTOMER_UNLINKED, "WHATSAPP_CUSTOMER_UNLINKED");
    assert.equal(JSON.stringify(WHATSAPP_AUDIT).includes("textBody"), false);
  });
});
