import { apiRequest } from "@/infrastructure/api/client";
import type { ApiResponse } from "@/infrastructure/api/types";
import type {
  AuthUser,
  LoginResponse,
  TokenPair,
} from "@/infrastructure/auth/auth.types";

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RefreshPayload {
  refreshToken: string;
}

export const authApi = {
  login(payload: LoginPayload): Promise<ApiResponse<LoginResponse>> {
    return apiRequest<LoginResponse>("/auth/login", {
      method: "POST",
      body: payload,
    });
  },
  refresh(payload: RefreshPayload): Promise<ApiResponse<TokenPair>> {
    return apiRequest<TokenPair>("/auth/refresh", {
      method: "POST",
      body: payload,
    });
  },
  me(): Promise<ApiResponse<AuthUser>> {
    return apiRequest<AuthUser>("/auth/me");
  },
  logout(): Promise<ApiResponse<{ message: string }>> {
    return apiRequest<{ message: string }>("/auth/logout", { method: "POST" });
  },
};
