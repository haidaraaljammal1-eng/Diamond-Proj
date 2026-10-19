"use client";

import {
  FN,
  useLegacyOrFunctionalCapability,
} from "@/modules/functional-rbac";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { useUsersStore } from "../stores/users.store";
import type { CreateUserPayload, UpdateUserPayload } from "../types/user.types";
import {
  USERS_CREATE_PERMISSION,
  USERS_DELETE_PERMISSION,
  USERS_UPDATE_PERMISSION,
} from "../users.permissions";

export interface UseUserMutationsResult {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canEnableDisable: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  createError: ApiRequestError | null;
  updateError: ApiRequestError | null;
  deleteError: ApiRequestError | null;
  clearCreateError: () => void;
  clearUpdateError: () => void;
  clearDeleteError: () => void;
  addUser: (payload: CreateUserPayload) => Promise<boolean>;
  editUser: (id: number, payload: UpdateUserPayload) => Promise<boolean>;
  removeUser: (id: number) => Promise<boolean>;
  setUserStatus: (
    id: number,
    status: "ACTIVE" | "SUSPENDED",
  ) => Promise<boolean>;
  isStatusUpdating: (id: number) => boolean;
  isDeletingUser: (id: number) => boolean;
}

export function useUserMutations(): UseUserMutationsResult {
  const canCreate = useLegacyOrFunctionalCapability(
    USERS_CREATE_PERMISSION,
    FN.users.create,
  );
  const canUpdate = useLegacyOrFunctionalCapability(
    USERS_UPDATE_PERMISSION,
    FN.users.edit,
  );
  const canDelete = useLegacyOrFunctionalCapability(
    USERS_DELETE_PERMISSION,
    FN.users.delete,
  );
  const canEnableDisable = useLegacyOrFunctionalCapability(
    USERS_UPDATE_PERMISSION,
    FN.users.enableDisable,
  );

  const isCreating = useUsersStore((state) => state.isCreating);
  const isUpdating = useUsersStore((state) => state.isUpdating);
  const isDeleting = useUsersStore((state) => state.isDeleting);
  const deletingId = useUsersStore((state) => state.deletingId);
  const createError = useUsersStore((state) => state.createError);
  const updateError = useUsersStore((state) => state.updateError);
  const deleteError = useUsersStore((state) => state.deleteError);
  const clearCreateError = useUsersStore((state) => state.clearCreateError);
  const clearUpdateError = useUsersStore((state) => state.clearUpdateError);
  const clearDeleteError = useUsersStore((state) => state.clearDeleteError);
  const createUser = useUsersStore((state) => state.createUser);
  const updateUser = useUsersStore((state) => state.updateUser);
  const deleteUser = useUsersStore((state) => state.deleteUser);
  const setUserStatus = useUsersStore((state) => state.setUserStatus);
  const statusUpdatingIds = useUsersStore((state) => state.statusUpdatingIds);

  return {
    canCreate,
    canUpdate,
    canDelete,
    canEnableDisable,
    isCreating,
    isUpdating,
    isDeleting,
    createError,
    updateError,
    deleteError,
    clearCreateError,
    clearUpdateError,
    clearDeleteError,
    addUser: createUser,
    editUser: updateUser,
    removeUser: deleteUser,
    setUserStatus,
    isStatusUpdating: (id) => statusUpdatingIds[id] === true,
    isDeletingUser: (id) => isDeleting && deletingId === id,
  };
}
