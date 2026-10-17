import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseWhapiContactRow } from "src/modules/whatsapp/whapi.contacts.parse";

describe("whapi contacts parse", () => {
  it("parses phone contact names and profile flag", () => {
    const parsed = parseWhapiContactRow({
      id: "971501234567@s.whatsapp.net",
      name: "Sara",
      profile_pic: "https://example.com/p.jpg",
    });
    assert.ok(parsed);
    assert.equal(parsed!.whapiDisplayName, "Sara");
    assert.equal(parsed!.hasProfilePicture, true);
  });

  it("skips group ids", () => {
    assert.equal(parseWhapiContactRow({ id: "1203@g.us", name: "Team" }), null);
  });

  it("accepts @lid ids without inventing phone digits", () => {
    const parsed = parseWhapiContactRow({
      id: "12345678901234@lid",
      pushname: "Hidden",
    });
    assert.ok(parsed);
    assert.equal(parsed!.providerContactId, "12345678901234@lid");
    assert.equal(parsed!.whapiDisplayName, "Hidden");
  });
});
