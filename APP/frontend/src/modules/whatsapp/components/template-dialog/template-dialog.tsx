"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import type { WhatsAppTemplateDto } from "../../types/whatsapp.types";
import { listWhatsAppTemplates } from "../../api/whatsapp.api";
import { resolveWhatsAppErrorMessage } from "../../utils/resolve-whatsapp-error";
import styles from "./template-dialog.module.css";

export function WhatsAppTemplateDialog({
  open,
  onClose,
  onSend,
  sending,
  simulationTemplates,
}: {
  open: boolean;
  onClose: () => void;
  onSend: (input: {
    name: string;
    language: string;
    headerParameters: string[];
    bodyParameters: string[];
  }) => Promise<boolean>;
  sending: boolean;
  simulationTemplates?: WhatsAppTemplateDto[];
}) {
  const t = useTranslations("WhatsApp");
  const [templates, setTemplates] = useState<WhatsAppTemplateDto[]>(simulationTemplates ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<WhatsAppTemplateDto | null>(null);
  const [headerValues, setHeaderValues] = useState<string[]>([]);
  const [bodyValues, setBodyValues] = useState<string[]>([]);

  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function load() {
    if (simulationTemplates) {
      setTemplates(simulationTemplates.filter((item) => item.sendable));
      return;
    }
    setLoading(true);
    try {
      const listed = await listWhatsAppTemplates();
      setTemplates(listed.filter((item) => item.sendable));
      setError(null);
    } catch (err) {
      setError(resolveWhatsAppErrorMessage(t, err));
    } finally {
      setLoading(false);
    }
  }

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return templates.filter((item) =>
      !term
        ? true
        : `${item.name} ${item.language} ${item.category ?? ""}`.toLowerCase().includes(term),
    );
  }, [templates, search]);

  function choose(template: WhatsAppTemplateDto) {
    setSelected(template);
    setHeaderValues(Array.from({ length: template.headerVariableCount }, () => ""));
    setBodyValues(Array.from({ length: template.bodyVariableCount }, () => ""));
  }

  async function send() {
    if (!selected) return;
    const ok = await onSend({
      name: selected.name,
      language: selected.language,
      headerParameters: headerValues.map((value) => value.trim()),
      bodyParameters: bodyValues.map((value) => value.trim()),
    });
    if (ok) onClose();
  }

  const canSend =
    selected &&
    headerValues.every((value) => value.trim().length > 0) &&
    bodyValues.every((value) => value.trim().length > 0) &&
    headerValues.length === (selected.headerVariableCount || 0) &&
    bodyValues.length === (selected.bodyVariableCount || 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("templates.title")}
      description={t("templates.description")}
      closeLabel={t("templates.close")}
    >
      <div className={styles.body} data-testid="whatsapp-template-dialog">
        {error ? <p className={styles.error}>{error}</p> : null}
        {!selected ? (
          <>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("templates.search")}
              aria-label={t("templates.search")}
            />
            <Button type="button" variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? t("templates.loading") : t("templates.load")}
            </Button>
            <ul className={styles.list}>
              {visible.map((template) => (
                <li key={`${template.name}:${template.language}`}>
                  <button type="button" className={styles.row} onClick={() => choose(template)}>
                    <strong>{template.name}</strong>
                    <span>
                      {template.language}
                      {template.category ? ` · ${template.category}` : ""}
                    </span>
                    <p>{template.bodyText || t("templates.previewUnavailable")}</p>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div>
            <p className={styles.preview} data-testid="whatsapp-template-preview">
              {[selected.headerText, selected.bodyText, selected.footerText].filter(Boolean).join("\n")}
            </p>
            {headerValues.map((value, index) => (
              <Input
                key={`h${index}`}
                value={value}
                onChange={(event) => {
                  const next = [...headerValues];
                  next[index] = event.target.value;
                  setHeaderValues(next);
                }}
                placeholder={t("templates.headerVariable", { n: index + 1 })}
              />
            ))}
            {bodyValues.map((value, index) => (
              <Input
                key={`b${index}`}
                value={value}
                onChange={(event) => {
                  const next = [...bodyValues];
                  next[index] = event.target.value;
                  setBodyValues(next);
                }}
                placeholder={t("templates.bodyVariable", { n: index + 1 })}
              />
            ))}
            <div className={styles.actions}>
              <Button type="button" variant="ghost" onClick={() => setSelected(null)}>
                {t("templates.back")}
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!canSend || sending}
                data-testid="whatsapp-template-send"
                onClick={() => void send()}
              >
                {t("templates.send")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
