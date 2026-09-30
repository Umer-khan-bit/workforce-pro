import { auth } from "@/auth";

// Proxy runs on the Node.js runtime, so it can use the full auth setup, which checks
// the database on every request so a deactivated user's session ends immediately.
export default auth;

export const config = {
  matcher: [
    "/candidate/:path*",
    "/recruiter/:path*",
    "/company-admin/:path*",
    "/admin/:path*",
    "/change-password",
  ],
};
