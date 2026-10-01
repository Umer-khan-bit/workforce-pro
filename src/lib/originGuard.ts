/**
 * Cross-site request protection for the API. The session cookie is already SameSite=Lax, which stops most
 * cross-site posts; this is a second lock. A request that changes data and comes from a browser page of ANOTHER
 * site (its Origin header names a different host) is refused. Requests with no Origin header (our own server-side
 * code, API clients using a key, curl) are not browser form posts, so they pass here and are checked by their own
 * credentials. Pure and import-free so the proxy and the tests can both use it.
 */

const CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** API areas that do not use the browser session, so a browser Origin means nothing for them. */
export const ORIGIN_EXEMPT_PREFIXES = ["/api/auth/", "/api/v1/", "/api/jobs/", "/api/mock-ats/"] as const;

export function crossSiteBlocks(args: { method: string; pathname: string; origin: string | null; host: string; allowedHosts?: string[] }): boolean {
  if (!CHANGING.has(args.method.toUpperCase())) return false;
  if (args.pathname !== "/api" && !args.pathname.startsWith("/api/")) return false;
  if (ORIGIN_EXEMPT_PREFIXES.some((p) => args.pathname.startsWith(p))) return false;
  if (!args.origin) return false;
  let originHost: string;
  try {
    originHost = new URL(args.origin).host;
  } catch {
    return true; // an Origin we cannot read is not one we trust
  }
  return originHost !== args.host && !(args.allowedHosts ?? []).includes(originHost);
}
