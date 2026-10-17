"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import {
  chooseLocalSaveDirectory,
  detectLocalSaveCapability,
  initialLocalSaveToolbarVisible,
} from "../../utils/whatsapp-local-save";

export function WhatsAppLocalSaveToolbar() {
  const t = useTranslations("WhatsApp");
  const [visible, setVisible] = useState(initialLocalSaveToolbarVisible);

  useEffect(() => {
    setVisible(detectLocalSaveCapability() === "directory");
  }, []);

  if (!visible) return null;

  return (
    <Button
      type="button"
      variant="secondary"
      size="md"
      data-testid="whatsapp-choose-media-folder"
      onClick={() => void chooseLocalSaveDirectory()}
    >
      {t("localSave.choose")}
    </Button>
  );
}
