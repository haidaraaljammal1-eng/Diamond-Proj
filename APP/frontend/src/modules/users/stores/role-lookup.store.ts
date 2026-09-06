"use client";

import { create } from "zustand";
import { lookupRoles, type RoleLookupItem } from "../api/role-lookup.api";

type RoleLookupStatus = "idle" | "loading" | "ready";

interface RoleLookupState {
  roles: RoleLookupItem[];
  status: RoleLookupStatus;
  load: () => Promise<void>;
}

let inFlight: Promise<void> | null = null;

export const useRoleLookupStore = create<RoleLookupState>((set, get) => ({
  roles: [],
  status: "idle",
  load() {
    const status = get().status;
    if (status === "ready" || status === "loading") {
      return inFlight ?? Promise.resolve();
    }

    if (!inFlight) {
      set({ status: "loading" });
      inFlight = lookupRoles()
        .then((roles) => {
          set({ roles, status: "ready" });
        })
        .finally(() => {
          inFlight = null;
        });
    }

    return inFlight;
  },
}));
