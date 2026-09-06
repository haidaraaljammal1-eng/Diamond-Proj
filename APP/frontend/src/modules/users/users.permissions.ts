/** Backend catalog keys from `APP/backend/src/constants/permissions.ts`. */
export const USERS_READ_PERMISSION = "users.read";
export const USERS_CREATE_PERMISSION = "users.create";
export const USERS_UPDATE_PERMISSION = "users.update";
export const USERS_DELETE_PERMISSION = "users.delete";
export const USERS_RESET_PASSWORD_PERMISSION = "users.reset_password";

export const USERS_PAGE_PERMISSIONS = [USERS_READ_PERMISSION] as const;
