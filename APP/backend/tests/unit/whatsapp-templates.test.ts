import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PERMISSIONS } from "src/constants/permissions";
import {
  assertTemplateParameters,
  buildTemplateSendComponents,
  isTemplateSendable,
  mapTemplateStatus,
  normalizeProviderTemplate,
  renderTemplatePreview,
} from "src/modules/whatsapp/whatsapp.templates";
import { WhatsAppErrorReason } from "src/modules/whatsapp/whatsapp.errors";

describe("whatsapp templates", () => {
  it("uses send permission distinct from read", () => {
    assert.equal(PERMISSIONS.WHATSAPP_SEND, "whatsapp.send");
    assert.notEqual(PERMISSIONS.WHATSAPP_SEND, PERMISSIONS.WHATSAPP_READ);
  });

  it("maps official statuses and treats unknown as OTHER", () => {
    assert.equal(mapTemplateStatus("approved"), "APPROVED");
    assert.equal(mapTemplateStatus("PAUSED"), "PAUSED");
    assert.equal(mapTemplateStatus("mystery"), "OTHER");
  });

  it("normalizes safe DTOs and marks only APPROVED text templates sendable", () => {
    const approved = normalizeProviderTemplate({
      id: "tpl-1",
      name: "hello_office",
      language: "en",
      status: "APPROVED",
      category: "UTILITY",
      components: [
        { type: "BODY", text: "Hello {{1}}, about {{2}}." },
        { type: "FOOTER", text: "Diamond" },
      ],
    });
    assert.ok(approved);
    assert.equal(approved?.sendable, true);
    assert.equal(approved?.bodyVariableCount, 2);
    assert.equal("accessToken" in (approved ?? {}), false);

    const pending = normalizeProviderTemplate({
      name: "pending_review",
      language: "en",
      status: "PENDING",
      components: [{ type: "BODY", text: "Wait" }],
    });
    assert.equal(pending?.sendable, false);
    assert.equal(isTemplateSendable({ status: "APPROVED", headerFormat: "IMAGE", hasDynamicButtons: false }), false);
    assert.equal(isTemplateSendable({ status: "APPROVED", headerFormat: "TEXT", hasDynamicButtons: true }), false);
  });

  it("validates language-specific name pairs and parameter counts", () => {
    const template = normalizeProviderTemplate({
      name: "hello_office",
      language: "ar",
      status: "APPROVED",
      components: [{ type: "BODY", text: "مرحبا {{1}}" }],
    });
    assert.ok(template);
    assert.equal(template?.language, "ar");
    assert.throws(() => assertTemplateParameters(template!, [], []));
    assert.throws(() => assertTemplateParameters(template!, [], [" "]));
    assert.doesNotThrow(() => assertTemplateParameters(template!, [], ["Ahmed"]));
    const components = buildTemplateSendComponents({
      template: template!,
      headerParameters: [],
      bodyParameters: ["Ahmed"],
    });
    assert.equal(components[0]?.type, "body");
    assert.equal(components[0]?.parameters[0]?.text, "Ahmed");
  });

  it("renders a safe preview without HTML", () => {
    const preview = renderTemplatePreview("Hello {{1}} <b>x</b>", null, "Office", [], ["Sara"]);
    assert.equal(preview.includes("<"), false);
    assert.match(preview, /Sara/);
    assert.equal(WhatsAppErrorReason.TEMPLATE_NOT_APPROVED, "WHATSAPP_TEMPLATE_NOT_APPROVED");
    assert.equal(WhatsAppErrorReason.TEMPLATE_PARAMETERS_INVALID, "WHATSAPP_TEMPLATE_PARAMETERS_INVALID");
  });
});
