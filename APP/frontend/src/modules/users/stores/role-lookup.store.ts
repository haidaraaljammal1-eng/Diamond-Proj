"use client";

import { create } from "zustand";
import { listAllRoles } from "@/modules/roles/api/roles.api";
import type { RoleDto } from "@/modules/roles/types/role.types";

type RoleLookupStatus = "idle" | "loading" | "ready";

interface RoleLookupState {
  roles: RoleDto[];
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
      inFlight = listAllRoles()
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
