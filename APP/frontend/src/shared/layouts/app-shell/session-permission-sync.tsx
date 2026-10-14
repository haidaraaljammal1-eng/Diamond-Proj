"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { registerSessionPermissionSyncHandler } from "@/infrastructure/auth/request-session-permission-sync";
import { isFunctionalRbacV2UiEnabled } from "@/modules/functional-rbac";

/** Bridges store-driven permission changes to NextAuth `update()` (auth/me sync). */
export function SessionPermissionSync() {
  const { update } = useSession();

  useEffect(() => {
    return registerSessionPermissionSyncHandler(() => {
      void update();
    });
  }, [update]);

  useEffect(() => {
    if (!isFunctionalRbacV2UiEnabled()) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void update();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [update]);

  return null;
}
