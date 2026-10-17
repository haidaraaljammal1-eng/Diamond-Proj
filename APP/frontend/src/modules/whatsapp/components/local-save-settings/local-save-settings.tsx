"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { chooseLocalSaveDirectory, detectLocalSaveCapability } from "../../utils/whatsapp-local-save";

export function WhatsAppLocalSaveToolbar() {
  const t = useTranslations("WhatsApp");
  if (detectLocalSaveCapability() !== "directory") return null;

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
