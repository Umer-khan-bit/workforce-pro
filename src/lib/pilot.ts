import type { PrismaClient, Role } from "@prisma/client";

/**
 * Pilot mode (Platform admin > Pilot mode): while it is on, only the chosen company can use the platform on the
 * company side. Recruiters and company admins of other companies cannot log in (and an open session ends at the
 * next click), and no new company can sign up. Candidates and platform admins are not affected: candidates are
 * the people being assessed during the pilot, and the platform team runs it.
 */
export type Pilot = { enabled: boolean; companyId: string | null };


export { PILOT_LOGIN_MESSAGE, PILOT_SIGNUP_MESSAGE } from "./pilot-messages";

export async function getPilot(db: Pick<PrismaClient, "pilotConfig">): Promise<Pilot> {
  const row = await db.pilotConfig.findFirst();
  return { enabled: Boolean(row?.enabled), companyId: row?.companyId ?? null };
}

/** True when this user is on the company side, belongs to a different company, and a pilot is on. */
export function pilotBlocksUser(pilot: Pilot, user: { role: Role; companyId: string | null }): boolean {
  if (!pilot.enabled) return false;
  if (user.role !== "RECRUITER" && user.role !== "COMPANY_ADMIN") return false;
  return user.companyId !== pilot.companyId;
}

/** True when a company that is not the pilot company is acting (API keys, scheduled jobs, webhooks). */
export function pilotBlocksCompany(pilot: Pilot, companyId: string): boolean {
  return pilot.enabled && pilot.companyId !== companyId;
}
