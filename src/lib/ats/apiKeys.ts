import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { isRateLimited } from "@/lib/rateLimit";
import { readSetting } from "@/lib/settings/store";
import { getPilot, pilotBlocksCompany } from "@/lib/pilot";
import { getEntitlements, planBlockMessage } from "@/lib/recruiter/entitlements";

export class AtsError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "AtsError";
  }
}

/** API keys look like `wfp_` followed by 43 random characters. Only the SHA-256 hash is stored, never the key. */
export const KEY_PREFIX = "wfp_";
export const hashApiKey = (key: string) => createHash("sha256").update(key).digest("hex");
export const generateApiKey = () => `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;

type Db = PrismaClient;

/**
 * Creates a labelled key for the company admin's company. The full key is returned ONCE and cannot be looked up
 * again. The plan must include ATS and API access, and the company is limited to a number of active keys (Settings).
 */
export async function createApiKey(db: Db, args: { userId: string; label: string }) {
  const user = await db.user.findUnique({ where: { id: args.userId }, select: { id: true, role: true, isActive: true, companyId: true } });
  if (!user?.isActive || user.role !== "COMPANY_ADMIN" || !user.companyId) throw new AtsError(403, "FORBIDDEN", "Only a company admin can create API keys.");
  const ent = await getEntitlements(user.companyId);
  if (!ent.canUseAts) throw new AtsError(403, "PLAN_FEATURE_REQUIRED", planBlockMessage(ent, "ATS and API access"));
  const integrations = await readSetting(db, "integrations");
  const active = await db.apiKey.count({ where: { companyId: user.companyId, revokedAt: null } });
  if (active >= integrations.maxApiKeys) throw new AtsError(409, "LIMIT_REACHED", `A company can have ${integrations.maxApiKeys} active API keys. Revoke one first.`);

  const key = generateApiKey();
  const row = await db.apiKey.create({
    data: { companyId: user.companyId, createdById: user.id, label: args.label.trim() || null, hashedKey: hashApiKey(key), prefix: key.slice(0, KEY_PREFIX.length + 4) },
  });
  await db.auditLog.create({ data: { actorId: user.id, action: "API_KEY_CREATED", targetType: "ApiKey", targetId: row.id } });
  return { id: row.id, key, prefix: row.prefix! };
}

export async function revokeApiKey(db: Db, args: { userId: string; id: string }) {
  const user = await db.user.findUnique({ where: { id: args.userId }, select: { id: true, role: true, isActive: true, companyId: true } });
  if (!user?.isActive || user.role !== "COMPANY_ADMIN" || !user.companyId) throw new AtsError(403, "FORBIDDEN", "Only a company admin can revoke API keys.");
  const { count } = await db.apiKey.updateMany({ where: { id: args.id, companyId: user.companyId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (count === 0) throw new AtsError(404, "NOT_FOUND", "API key not found.");
  await db.auditLog.create({ data: { actorId: user.id, action: "API_KEY_REVOKED", targetType: "ApiKey", targetId: args.id } });
}

export type ApiCaller = { keyId: string; companyId: string; createdById: string };

/**
 * Checks a request's `Authorization: Bearer <key>`: the key must exist and not be revoked, its company must not be
 * outside a pilot, and the company's plan must include ATS and API access right now. Each key has a request limit
 * per minute (Settings). Updates "last used" at most once a minute.
 */
export async function authenticateApiKey(db: Db, header: string | null): Promise<ApiCaller> {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  if (!match || !match[1].startsWith(KEY_PREFIX)) throw new AtsError(401, "UNAUTHORIZED", "Send your API key as: Authorization: Bearer <key>");
  const row = await db.apiKey.findUnique({ where: { hashedKey: hashApiKey(match[1]) } });
  if (!row || row.revokedAt) throw new AtsError(401, "UNAUTHORIZED", "That API key is not valid.");

  const [integrations, pilot, ent] = await Promise.all([readSetting(db, "integrations"), getPilot(db), getEntitlements(row.companyId)]);
  if (pilotBlocksCompany(pilot, row.companyId)) throw new AtsError(403, "PILOT_MODE", "The platform is in a pilot for another company right now.");
  if (!ent.canUseAts) throw new AtsError(403, "PLAN_FEATURE_REQUIRED", planBlockMessage(ent, "ATS and API access"));
  if (await isRateLimited(`apikey:${row.id}`, integrations.apiRequestsPerMinute, 60_000)) throw new AtsError(429, "RATE_LIMITED", "Too many requests. Slow down and try again in a minute.");

  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) await db.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  return { keyId: row.id, companyId: row.companyId, createdById: row.createdById };
}
