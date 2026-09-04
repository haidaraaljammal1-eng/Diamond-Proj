export interface AuthUser {
  id: number;
  email: string;
  roles: string[];
  permissions: string[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: string;
}

export interface LoginResponse {
  requiresTwoFactor: false;
  tokens: TokenPair;
}
