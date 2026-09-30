import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { getAllowedRoles } from "@/lib/authz";

/**
 * Edge-safe config shared between middleware and the full auth.ts.
 * No providers or database calls live here - those need the Node runtime.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = user.role;
        token.companyId = user.companyId;
        token.mustChangePassword = user.mustChangePassword;
      }
      if (trigger === "update" && session) {
        token.mustChangePassword = Boolean(
          (session as { mustChangePassword?: boolean }).mustChangePassword
        );
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub!;
      session.user.role = token.role as Role;
      session.user.companyId = token.companyId as string | null;
      session.user.mustChangePassword = token.mustChangePassword as boolean;
      return session;
    },
    authorized({ auth, request }) {
      const pathname = request.nextUrl.pathname;

      if (pathname === "/change-password") {
        return Boolean(auth?.user);
      }

      const allowedRoles = getAllowedRoles(pathname);
      if (!allowedRoles) return true;

      if (!auth?.user) return false;

      if (!allowedRoles.includes(auth.user.role)) {
        return NextResponse.redirect(new URL("/unauthorized", request.nextUrl));
      }

      if (auth.user.mustChangePassword) {
        return NextResponse.redirect(new URL("/change-password", request.nextUrl));
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
