"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import {
  chooseLocalSaveDirectory,
  detectLocalSaveCapability,
  initialLocalSaveToolbarVisible,
  localSaveStatus,
  subscribeLocalSave,
} from "../../utils/whatsapp-local-save";

export function WhatsAppLocalSaveToolbar() {
  const t = useTranslations("WhatsApp");
  const [visible, setVisible] = useState(initialLocalSaveToolbarVisible);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    setVisible(detectLocalSaveCapability() === "directory");
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const sync = () => {
      void localSaveStatus().then((status) => {
        if (!cancelled) setConfigured(status === "configured");
      });
    };
    sync();
    const unsubscribe = subscribeLocalSave(sync);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <Button
      type="button"
      variant="secondary"
      size="md"
      data-testid="whatsapp-choose-media-folder"
      data-configured={configured ? "true" : "false"}
      onClick={() => void chooseLocalSaveDirectory()}
    >
      {configured ? t("localSave.pathReady") : t("localSave.choose")}
    </Button>
  );
}
