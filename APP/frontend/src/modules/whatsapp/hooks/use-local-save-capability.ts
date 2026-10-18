"use client";

import { useEffect, useState } from "react";
import {
  detectLocalSaveCapability,
  type LocalSaveCapability,
} from "../utils/whatsapp-local-save-capability";

/**
 * Browser capability probe safe for SSR. Returns `"manual"` until after mount so
 * the first client render matches the server HTML.
 */
export function useLocalSaveCapability(): LocalSaveCapability {
  const [capability, setCapability] = useState<LocalSaveCapability>("manual");

  useEffect(() => {
    setCapability(detectLocalSaveCapability());
  }, []);

  return capability;
}
