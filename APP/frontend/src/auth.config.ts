import type { NextAuthConfig } from "next-auth";

export default {
  pages: { signIn: "/ar/login" },
  callbacks: { authorized: ({ auth }) => !!auth?.user },
  providers: [],
} satisfies NextAuthConfig;
