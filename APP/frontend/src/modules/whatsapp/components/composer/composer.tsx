"use client";

import { useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Icon } from "@/shared/components/ui/icon";
import { useWhatsApp } from "../../hooks/use-whatsapp";
import {
  conversationEligibility,
  isClientSendWindowStillOpen,
} from "../../utils/whatsapp-view-model";
import { WHATSAPP_TEXT_BODY_MAX } from "../../types/whatsapp.types";
import { resolveWhatsAppErrorMessage } from "../../utils/resolve-whatsapp-error";
import { WhatsAppTemplateDialog } from "../template-dialog/template-dialog";
import styles from "./composer.module.css";

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function WhatsAppComposer() {
  const t = useTranslations("WhatsApp");
  const inbox = useWhatsApp();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<"IMAGE" | "DOCUMENT" | "AUDIO" | "VIDEO">("IMAGE");
  const idempotencyKey = useRef(newIdempotencyKey());
  const fileInput = useRef<HTMLInputElement>(null);
  const eligibility = conversationEligibility(inbox.selectedConversation);
  const trimmed = text.replace(/^[\s\uFEFF\u200B]+|[\s\uFEFF\u200B]+$/g, "");
  const windowOpen = Boolean(
    eligibility?.canSendText &&
      (inbox.simulationActive || isClientSendWindowStillOpen(eligibility.windowExpiresAt)),
  );
  const enabled = inbox.hasSendPermission && !submitting && !inbox.sending;
  const canSubmitText = enabled && windowOpen && trimmed.length > 0 && trimmed.length <= WHATSAPP_TEXT_BODY_MAX;
  const canSendTemplate = Boolean(enabled && eligibility?.canSendTemplate);
  const canSendMedia = Boolean(enabled && eligibility?.canSendMedia && windowOpen);

  function hint(): string {
    if (!inbox.hasSendPermission && !inbox.simulationActive) return t("composer.noPermission");
    if (!eligibility) return t("composer.disabledHint");
    if (windowOpen) return t("composer.readyHint");
    if (eligibility.canSendTemplate) return t("composer.reason.CUSTOMER_SERVICE_WINDOW_CLOSED");
    return t(`composer.reason.${eligibility.reason}`);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (file && canSendMedia) {
      setSubmitting(true);
      const ok = await inbox.sendMedia(
        { file, messageType: kind, caption: trimmed || undefined },
        idempotencyKey.current,
      );
      setSubmitting(false);
      if (ok) {
        setText("");
        setFile(null);
        idempotencyKey.current = newIdempotencyKey();
      }
      return;
    }
    if (!canSubmitText) return;
    setSubmitting(true);
    const ok = await inbox.sendText(trimmed, idempotencyKey.current);
    setSubmitting(false);
    if (ok) {
      setText("");
      idempotencyKey.current = newIdempotencyKey();
    }
  }

  const sendError = resolveWhatsAppErrorMessage(t, inbox.sendError);

  return (
    <form className={styles.composer} data-testid="whatsapp-composer" onSubmit={onSubmit}>
      <p className={styles.hint}>{hint()}</p>
      {sendError ? (
        <p className={styles.sendError} role="alert">
          {sendError}
        </p>
      ) : null}
      {file ? (
        <p className={styles.file} data-testid="whatsapp-selected-file">
          {file.name} · {(file.size / 1024).toFixed(0)} KB
          <Button type="button" variant="ghost" size="sm" onClick={() => setFile(null)}>
            {t("media.remove")}
          </Button>
        </p>
      ) : null}
      <div className={styles.row}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!canSendMedia}
          data-testid="whatsapp-attach"
          aria-label={t("media.attach")}
          onClick={() => setAttachOpen((open) => !open)}
        >
          <Icon name="mdi:paperclip" size={16} />
        </Button>
        <textarea
          className={styles.input}
          value={text}
          disabled={!enabled || (!windowOpen && !file)}
          maxLength={WHATSAPP_TEXT_BODY_MAX}
          placeholder={t("composer.placeholder")}
          aria-label={t("composer.inputLabel")}
          rows={1}
          onChange={(event) => setText(event.target.value)}
        />
        {canSendTemplate ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="whatsapp-use-template"
            onClick={() => setTemplateOpen(true)}
          >
            {t("templates.use")}
          </Button>
        ) : null}
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={file ? !canSendMedia : !canSubmitText}
          aria-label={t("composer.send")}
        >
          <Icon name="mdi:send" size={16} />
        </Button>
      </div>
      {attachOpen ? (
        <div className={styles.attach} data-testid="whatsapp-attach-menu">
          {(["IMAGE", "DOCUMENT", "AUDIO", "VIDEO"] as const).map((item) => (
            <Button
              key={item}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setKind(item);
                fileInput.current?.click();
              }}
            >
              {t(`messageType.${item}`)}
            </Button>
          ))}
        </div>
      ) : null}
      <input
        ref={fileInput}
        type="file"
        hidden
        onChange={(event) => {
          const next = event.target.files?.[0] ?? null;
          setFile(next);
          setAttachOpen(false);
          event.target.value = "";
        }}
      />
      <WhatsAppTemplateDialog
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        sending={inbox.sending || submitting}
        simulationTemplates={inbox.simulationActive ? inbox.simulationTemplates : undefined}
        onSend={async (input) => {
          const ok = await inbox.sendTemplate(input, idempotencyKey.current);
          if (ok) idempotencyKey.current = newIdempotencyKey();
          return ok;
        }}
      />
    </form>
  );
}
