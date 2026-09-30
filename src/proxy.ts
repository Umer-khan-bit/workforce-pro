import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    "/candidate/:path*",
    "/recruiter/:path*",
    "/company-admin/:path*",
    "/admin/:path*",
    "/change-password",
  ],
};
