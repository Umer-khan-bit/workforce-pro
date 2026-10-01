/**
 * The forced password change, applied to every API route in one place (the proxy runs it before any
 * route handler, see `authorized` in auth.config.ts and the matcher in proxy.ts). A signed-in user whose
 * account says "must change password" can only reach the routes below; everything else answers 403.
 * New API routes are covered automatically: nothing has to remember to call a guard.
 *
 * Pure functions with no imports, so the proxy (edge-safe) and the tests can both use them.
 */

/** Routes a user who must change their password may still call. */
export const PASSWORD_CHANGE_EXEMPT_API = {
  /** Saving the new password itself. */
  exact: ["/api/account/change-password"],
  /** Sign-in, sign-out and session routes (Auth.js), and the emailed-link routes under /api/auth. */
  prefixes: ["/api/auth/"],
} as const;

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/** True when this API request must be refused because the user still has to change their password. */
export function passwordChangeBlocksApi(pathname: string, mustChangePassword: boolean | undefined): boolean {
  if (!mustChangePassword || !isApiPath(pathname)) return false;
  // Compare on a normalised path so "/api/account/change-password/" or "//" tricks do not slip past.
  const path = pathname.replace(/\/+$/, "") || "/";
  if (PASSWORD_CHANGE_EXEMPT_API.exact.some((p) => path === p)) return false;
  if (PASSWORD_CHANGE_EXEMPT_API.prefixes.some((p) => path.startsWith(p))) return false;
  return true;
}

export const PASSWORD_CHANGE_REQUIRED_BODY = {
  error: "You must change your temporary password before you can continue.",
  code: "PASSWORD_CHANGE_REQUIRED",
} as const;
