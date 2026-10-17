import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeWhapiContactDisplayName,
  resolveConversationDisplayTitle,
} from "src/modules/whatsapp/whatsapp.display-title";

describe("whatsapp display title", () => {
  it("prefers linked customer name over stored and Whapi labels", () => {
    const title = resolveConversationDisplayTitle({
      linkedCustomerName: "Diamond Customer",
      customerDisplayName: "Whapi Name",
      customerWaId: "971501234567",
      providerChatId: "971501234567@s.whatsapp.net",
    });
    assert.equal(title, "Diamond Customer");
  });

  it("keeps opaque @lid id when no better label exists", () => {
    const lid = "12345678901234@lid";
    const title = resolveConversationDisplayTitle({
      linkedCustomerName: null,
      customerDisplayName: null,
      customerWaId: lid,
      providerChatId: lid,
    });
    assert.equal(title, lid);
  });

  it("does not overwrite linked customer display with Whapi contact name", () => {
    const merged = mergeWhapiContactDisplayName("Staff", "Whapi", "971501234567", true);
    assert.equal(merged, "Staff");
  });

  it("replaces bare phone storage with Whapi contact name", () => {
    const merged = mergeWhapiContactDisplayName("971501234567", "Ali", "971501234567", false);
    assert.equal(merged, "Ali");
  });

  it("ignores empty Whapi names", () => {
    const merged = mergeWhapiContactDisplayName("Ali", "   ", "971501234567", false);
    assert.equal(merged, "Ali");
  });
});
