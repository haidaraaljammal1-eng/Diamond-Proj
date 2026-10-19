"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { registerSessionPermissionSyncHandler } from "@/infrastructure/auth/request-session-permission-sync";
import { isFunctionalRbacV2UiEnabled } from "@/modules/functional-rbac";

const POLL_MS = 1000;

/** POST body so Auth.js runs the jwt callback with `trigger: "update"`. */
const SESSION_PERMISSION_SYNC_UPDATE = { diamondPermissionSync: true as const };

/** Bridges store-driven permission changes to NextAuth `update()` (auth/me sync). */
export function SessionPermissionSync() {
  const { update } = useSession();
  const updatingRef = useRef(false);

  useEffect(() => {
    return registerSessionPermissionSyncHandler(() => {
      void update(SESSION_PERMISSION_SYNC_UPDATE);
    });
  }, [update]);

  useEffect(() => {
    if (!isFunctionalRbacV2UiEnabled()) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const runUpdate = () => {
      if (document.visibilityState !== "visible" || updatingRef.current) return;
      updatingRef.current = true;
      void update(SESSION_PERMISSION_SYNC_UPDATE).finally(() => {
        updatingRef.current = false;
      });
    };

    const stopPolling = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const startPolling = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(runUpdate, POLL_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        runUpdate();
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (document.visibilityState === "visible") {
      runUpdate();
      startPolling();
    }

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [update]);

  return null;
}
