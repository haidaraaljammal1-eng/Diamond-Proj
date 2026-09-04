import type { DefaultSession } from "next-auth";
import type { JWT as DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: "RefreshAccessTokenError";
    user: DefaultSession["user"] & {
      id: string;
      roles: string[];
      permissions: string[];
    };
  }

  interface User {
    roles: string[];
    permissions: string[];
    accessToken: string;
    accessTokenExpiresAt: number;
    refreshToken: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    userId?: string;
    roles?: string[];
    permissions?: string[];
    accessToken?: string;
    accessTokenExpiresAt?: number;
    refreshToken?: string;
    error?: "RefreshAccessTokenError";
  }
}
