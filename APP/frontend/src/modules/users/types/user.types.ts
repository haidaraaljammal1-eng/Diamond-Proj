/** Backend `UserStatus` enum — never invent ENABLED/DISABLED. */
export type UserStatus = "PENDING" | "ACTIVE" | "SUSPENDED";

export interface UserRoleSummary {
  id: number;
  key: string;
  name: string;
}

export interface UserDto {
  id: number;
  email: string;
  name: string | null;
  status: UserStatus;
  roles: UserRoleSummary[];
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UsersListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: UserStatus;
  sort?: string;
}

export interface CreateUserPayload {
  email: string;
  name?: string;
  roleIds?: number[];
  password: string;
  confirmPassword: string;
}

export interface UpdateUserPayload {
  email?: string;
  name?: string | null;
  roleIds?: number[];
}

export interface CreateUserResult {
  user: UserDto;
}
