"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Icon } from "@/shared/components/ui/icon";
import { useWhatsApp } from "../../hooks/use-whatsapp";
import { conversationEligibility } from "../../utils/whatsapp-view-model";
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
  const [kind, setKind] = useState<"IMAGE" | "DOCUMENT" | "AUDIO" | "VIDEO" | "VOICE">("IMAGE");
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recordTimer = useRef<number | null>(null);
  const recordChunks = useRef<Blob[]>([]);
  const idempotencyKey = useRef(newIdempotencyKey());
  const fileInput = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const composingRef = useRef(false);
  const eligibility = conversationEligibility(inbox.selectedConversation);
  const trimmed = text.replace(/^[\s\uFEFF\u200B]+|[\s\uFEFF\u200B]+$/g, "");
  const enabled = inbox.hasSendPermission && !submitting && !inbox.sending;
  const canSubmitText =
    enabled &&
    inbox.canSend &&
    trimmed.length > 0 &&
    trimmed.length <= WHATSAPP_TEXT_BODY_MAX;
  const canSendTemplate = Boolean(enabled && inbox.canSendTemplate);
  const canSendMedia = Boolean(enabled && inbox.canSendMedia);
  const canRecord = typeof MediaRecorder !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";

  useEffect(() => {
    return () => {
      if (voiceUrl) URL.revokeObjectURL(voiceUrl);
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, [voiceUrl]);

  function hint(): string | null {
    if (!inbox.hasSendPermission && !inbox.simulationActive) return t("composer.noPermission");
    if (!inbox.selectedConversationId) return t("composer.selectConversation");
    if (!eligibility) return t("composer.loadingDetail");
    if (inbox.canSend) return null;
    if (eligibility.reason === "QR_REQUIRED") return t("composer.reason.QR_REQUIRED");
    if (eligibility.reason === "PROVIDER_NOT_AUTHENTICATED") {
      return t("composer.reason.PROVIDER_NOT_AUTHENTICATED");
    }
    if (eligibility.reason === "CUSTOMER_SERVICE_WINDOW_CLOSED" && eligibility.canSendTemplate) {
      return t("composer.reason.CUSTOMER_SERVICE_WINDOW_CLOSED");
    }
    return t(`composer.reason.${eligibility.reason}`);
  }

  function clearVoicePreview() {
    if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    setVoiceUrl(null);
    if (kind === "VOICE") setFile(null);
  }

  function stopRecording(discard: boolean) {
    const active = recorder.current;
    recorder.current = null;
    if (recordTimer.current != null) window.clearInterval(recordTimer.current);
    recordTimer.current = null;
    setRecording(false);
    if (!active) return;
    if (discard) recordChunks.current = [];
    active.onstop = () => {
      active.stream.getTracks().forEach((track) => track.stop());
      if (discard) return;
      const blob = new Blob(recordChunks.current, { type: active.mimeType || "audio/webm" });
      const extension = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
      const nextUrl = URL.createObjectURL(blob);
      setVoiceUrl(nextUrl);
      setKind("VOICE");
      setFile(new File([blob], `voice.${extension}`, { type: blob.type || "audio/webm" }));
    };
    if (active.state !== "inactive") active.stop();
  }

  async function startRecording() {
    setRecordError(null);
    if (!canRecord) {
      setRecordError(t("media.micMissing"));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((item) =>
        MediaRecorder.isTypeSupported(item),
      );
      const next = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      recordChunks.current = [];
      next.ondataavailable = (event) => {
        if (event.data.size > 0) recordChunks.current.push(event.data);
      };
      next.start();
      recorder.current = next;
      setRecordSeconds(0);
      setRecording(true);
      recordTimer.current = window.setInterval(() => setRecordSeconds((value) => value + 1), 1000);
    } catch {
      setRecordError(t("media.micDenied"));
    }
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
        clearVoicePreview();
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
    <form
      ref={formRef}
      className={styles.composer}
      data-testid="whatsapp-composer"
      onSubmit={onSubmit}
    >
      {hint() ? <p className={styles.hint}>{hint()}</p> : null}
      {sendError ? (
        <p className={styles.sendError} role="alert">
          {sendError}
        </p>
      ) : null}
      {recordError ? (
        <p className={styles.sendError} role="alert">
          {recordError}
        </p>
      ) : null}
      {recording ? (
        <div className={styles.file} data-testid="whatsapp-recording">
          {t("media.recording")} {String(Math.floor(recordSeconds / 60)).padStart(2, "0")}:
          {String(recordSeconds % 60).padStart(2, "0")}
          <Button type="button" variant="secondary" size="sm" onClick={() => stopRecording(false)}>
            {t("media.stop")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => stopRecording(true)}>
            {t("media.cancel")}
          </Button>
        </div>
      ) : null}
      {voiceUrl && file && kind === "VOICE" ? (
        <div className={styles.file} data-testid="whatsapp-voice-preview">
          <audio controls src={voiceUrl} />
          <Button type="button" variant="ghost" size="sm" onClick={clearVoicePreview}>
            {t("media.cancel")}
          </Button>
        </div>
      ) : null}
      {file && kind !== "VOICE" ? (
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!canSendMedia || recording}
          data-testid="whatsapp-record"
          aria-label={t("media.record")}
          onClick={() => void startRecording()}
        >
          <Icon name="mdi:microphone" size={16} />
        </Button>
        <textarea
          className={styles.input}
          value={text}
          disabled={!enabled || (!inbox.canSend && !file)}
          maxLength={WHATSAPP_TEXT_BODY_MAX}
          placeholder={t("composer.placeholder")}
          aria-label={t("composer.inputLabel")}
          rows={1}
          onChange={(event) => setText(event.target.value)}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || composingRef.current) {
              return;
            }
            event.preventDefault();
            if (file ? !canSendMedia : !canSubmitText) return;
            formRef.current?.requestSubmit();
          }}
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
                clearVoicePreview();
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
