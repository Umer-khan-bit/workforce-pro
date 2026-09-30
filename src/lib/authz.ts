import type { Role } from "@prisma/client";

const ROUTE_ROLES: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: "/candidate", roles: ["CANDIDATE"] },
  { prefix: "/recruiter", roles: ["RECRUITER"] },
  { prefix: "/company-admin", roles: ["COMPANY_ADMIN"] },
  { prefix: "/admin", roles: ["PLATFORM_ADMIN"] },
];

/**
 * Returns the roles allowed to access a path, or null if the path isn't
 * role-restricted. A path matches if it equals a prefix or starts with
 * "<prefix>/".
 */
export function getAllowedRoles(pathname: string): Role[] | null {
  const match = ROUTE_ROLES.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)
  );
  return match ? match.roles : null;
}

export function isRoleAllowed(pathname: string, role: Role): boolean {
  const allowed = getAllowedRoles(pathname);
  if (!allowed) return true;
  return allowed.includes(role);
}

export const ROLE_HOME_PATH: Record<Role, string> = {
  CANDIDATE: "/candidate",
  RECRUITER: "/recruiter",
  COMPANY_ADMIN: "/company-admin",
  PLATFORM_ADMIN: "/admin",
};
