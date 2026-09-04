export interface AuthUser {
  id: number;
  email: string;
  name: string | null;
  roles: string[];
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
