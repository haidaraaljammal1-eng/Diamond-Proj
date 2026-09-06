/** A role as the Backend returns it (GET /auth/me, GET /users). */
export interface BackendRole {
  id: number;
  key: string;
  name: string;
}

/** The Backend user payload — roles are objects, not role keys. */
export interface AuthUser {
  id: number;
  email: string;
  name: string | null;
  roles: BackendRole[];
  permissions: string[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  refreshExpiresAt: string;
}

export type LoginResult =
  | {
      requiresTwoFactor: false;
      accessToken: string;
      refreshToken: string;
      tokenType: "Bearer";
      expiresIn: number;
      refreshExpiresAt: string;
    }
  | {
      requiresTwoFactor: true;
      challengeToken: string;
      expiresIn: number;
    };
