import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { getAllowedRoles } from "@/lib/authz";
import { PASSWORD_CHANGE_REQUIRED_BODY, isApiPath, passwordChangeBlocksApi } from "@/lib/passwordGate";

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
    // Copies the user's details into the token at sign-in (from authorize(), which read them from the
    // database). Anything the browser sends later through session.update() is deliberately ignored:
    // in particular mustChangePassword is re-read from the database on every request in auth.ts.
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.companyId = user.companyId;
        token.mustChangePassword = user.mustChangePassword;
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

      // Every API route: a user who must change their password gets a 403 (except the change-password and
      // sign-out routes). Each route still does its own role and ownership checks after this.
      if (isApiPath(pathname)) {
        if (passwordChangeBlocksApi(pathname, auth?.user?.mustChangePassword)) {
          return NextResponse.json(PASSWORD_CHANGE_REQUIRED_BODY, { status: 403 });
        }
        return true;
      }

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
