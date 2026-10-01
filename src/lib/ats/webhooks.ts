import { createHmac, randomBytes } from "node:crypto";
import type { PrismaClient, WebhookDelivery } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { notifyUser } from "@/lib/notifications";
import { getPilot, pilotBlocksCompany } from "@/lib/pilot";
import { readSetting } from "@/lib/settings/store";
import { getEntitlements, planBlockMessage } from "@/lib/recruiter/entitlements";
import { AtsError } from "./apiKeys";

/** The events a company can subscribe to. */
export const WEBHOOK_EVENTS = [
  { key: "shortlist.created", label: "A candidate was shortlisted" },
  { key: "shortlist.status_changed", label: "A shortlisted candidate moved to another stage" },
  { key: "candidate.hired", label: "A candidate was marked as hired" },
  { key: "contact_request.answered", label: "A candidate answered a contact request" },
  { key: "candidate.exported", label: "A candidate was pushed to the ATS" },
  { key: "webhook.test", label: "A test event (sent when you press Send test)" },
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]["key"];
export const EVENT_KEYS = WEBHOOK_EVENTS.map((e) => e.key) as string[];

const PRIVATE_HOST = /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.lan)$/i;

function isPrivateIp(host: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const bare = host.replace(/^\[|\]$/g, "").toLowerCase();
  return bare.includes(":") && (bare === "::1" || bare === "::" || bare.startsWith("fc") || bare.startsWith("fd") || bare.startsWith("fe80") || bare.startsWith("::ffff:"));
}

/**
 * Webhook addresses must be https and must not point at the inside of a network (so a company cannot make our
 * server call internal services). In demo mode, and only then, the app's own address is allowed so the built-in
 * test receiver works. Returns the cleaned URL, or throws an AtsError that says what is wrong.
 */
export function validateWebhookUrl(raw: string, opts: { demo: boolean; appBaseUrl: string }): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new AtsError(400, "INVALID_URL", "That is not a valid web address.");
  }
  if (url.username || url.password) throw new AtsError(400, "INVALID_URL", "The web address must not contain a user name or password.");
  const ownOrigin = (() => {
    try {
      return new URL(opts.appBaseUrl).origin;
    } catch {
      return null;
    }
  })();
  if (opts.demo && ownOrigin && url.origin === ownOrigin) return url.toString();
  if (url.protocol !== "https:") throw new AtsError(400, "INVALID_URL", "Webhook addresses must start with https://");
  const host = url.hostname;
  if (PRIVATE_HOST.test(host) || isPrivateIp(host) || !host.includes(".")) throw new AtsError(400, "INVALID_URL", "That address points inside a private network, which is not allowed.");
  return url.toString();
}

export const signPayload = (secret: string, timestamp: string, body: string) => `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
export const generateSecret = () => `whsec_${randomBytes(24).toString("base64url")}`;

type Db = PrismaClient;
type Fetch = typeof fetch;

async function adminFor(db: Db, userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, isActive: true, companyId: true } });
  if (!u?.isActive || u.role !== "COMPANY_ADMIN" || !u.companyId) throw new AtsError(403, "FORBIDDEN", "Only a company admin can manage webhooks.");
  return { id: u.id, companyId: u.companyId };
}

export async function createEndpoint(db: Db, args: { userId: string; url: string; events: string[] }) {
  const admin = await adminFor(db, args.userId);
  const ent = await getEntitlements(admin.companyId);
  if (!ent.canUseAts) throw new AtsError(403, "PLAN_FEATURE_REQUIRED", planBlockMessage(ent, "ATS and API access"));
  const events = [...new Set(args.events)].filter((e) => EVENT_KEYS.includes(e) && e !== "webhook.test");
  if (events.length === 0) throw new AtsError(400, "NO_EVENTS", "Choose at least one event.");
  const url = validateWebhookUrl(args.url, { demo: process.env.DEMO_MODE === "true", appBaseUrl: process.env.APP_BASE_URL?.trim() || "http://localhost:7310" });
  const secret = generateSecret();
  const endpoint = await db.webhookEndpoint.create({ data: { companyId: admin.companyId, url, secret, events } });
  await db.auditLog.create({ data: { actorId: admin.id, action: "WEBHOOK_CREATED", targetType: "WebhookEndpoint", targetId: endpoint.id } });
  return { id: endpoint.id, secret }; // the secret is shown once
}

export async function updateEndpoint(db: Db, args: { userId: string; id: string; isActive?: boolean; events?: string[] }) {
  const admin = await adminFor(db, args.userId);
  const data: Prisma.WebhookEndpointUpdateManyMutationInput = {};
  if (args.isActive !== undefined) data.isActive = args.isActive;
  if (args.events) {
    const events = [...new Set(args.events)].filter((e) => EVENT_KEYS.includes(e) && e !== "webhook.test");
    if (events.length === 0) throw new AtsError(400, "NO_EVENTS", "Choose at least one event.");
    data.events = events;
  }
  const { count } = await db.webhookEndpoint.updateMany({ where: { id: args.id, companyId: admin.companyId }, data });
  if (count === 0) throw new AtsError(404, "NOT_FOUND", "Webhook not found.");
  await db.auditLog.create({ data: { actorId: admin.id, action: "WEBHOOK_UPDATED", targetType: "WebhookEndpoint", targetId: args.id } });
}

export async function deleteEndpoint(db: Db, args: { userId: string; id: string }) {
  const admin = await adminFor(db, args.userId);
  const endpoint = await db.webhookEndpoint.findFirst({ where: { id: args.id, companyId: admin.companyId } });
  if (!endpoint) throw new AtsError(404, "NOT_FOUND", "Webhook not found.");
  await db.$transaction([db.webhookDelivery.deleteMany({ where: { endpointId: endpoint.id } }), db.webhookEndpoint.delete({ where: { id: endpoint.id } })]);
  await db.auditLog.create({ data: { actorId: admin.id, action: "WEBHOOK_DELETED", targetType: "WebhookEndpoint", targetId: endpoint.id } });
}

/** One attempt to deliver a payload. Redirects are never followed, and only the status code is kept (not the answer). */
export async function deliver(db: Db, deliveryId: string, fetchImpl: Fetch = fetch, now = new Date()): Promise<WebhookDelivery | null> {
  const delivery = await db.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { endpoint: true } });
  if (!delivery || delivery.status === "SUCCESS") return delivery;
  const integrations = await readSetting(db, "integrations");
  const pilot = await getPilot(db);
  const { endpoint } = delivery;

  const timestamp = String(Math.floor(now.getTime() / 1000));
  const body = JSON.stringify({ id: delivery.id, event: delivery.event, createdAt: delivery.createdAt.toISOString(), data: delivery.payload });
  let responseStatus: number | null = null;
  let error: string | null = null;

  if (!endpoint.isActive) error = "The webhook is switched off.";
  else if (pilotBlocksCompany(pilot, endpoint.companyId)) error = "The platform is in a pilot for another company.";
  else {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), integrations.webhookTimeoutSeconds * 1000);
    try {
      const res = await fetchImpl(endpoint.url, {
        method: "POST",
        redirect: "manual",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "User-Agent": "WorkforcePro-Webhooks/1", "X-Workforce-Event": delivery.event, "X-Workforce-Delivery": delivery.id, "X-Workforce-Timestamp": timestamp, "X-Workforce-Signature": signPayload(endpoint.secret, timestamp, body) },
        body,
      });
      responseStatus = res.status;
      if (res.status < 200 || res.status >= 300) error = `The receiver answered ${res.status}.`;
    } catch (err) {
      error = err instanceof Error && err.name === "AbortError" ? "The receiver did not answer in time." : "The receiver could not be reached.";
    } finally {
      clearTimeout(timer);
    }
  }

  const ok = error === null;
  const attempts = delivery.attempt;
  const exhausted = !ok && attempts >= integrations.webhookMaxAttempts;
  const updated = await db.webhookDelivery.update({
    where: { id: delivery.id },
    data: { status: ok ? "SUCCESS" : "FAILED", respondedAt: now, responseStatus, error, nextAttemptAt: ok || exhausted ? null : new Date(now.getTime() + integrations.webhookRetryMinutes * 60_000) },
  });
  if (exhausted) await tellAdminsAboutFailure(db, endpoint.companyId, endpoint.url);
  return updated;
}

async function tellAdminsAboutFailure(db: Db, companyId: string, url: string) {
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "a webhook address";
    }
  })();
  const admins = await db.user.findMany({ where: { companyId, role: "COMPANY_ADMIN", isActive: true }, select: { id: true } });
  for (const a of admins) await notifyUser(db, { userId: a.id, templateKey: "WEBHOOK_FAILING_IN_APP", type: "GENERAL", values: { endpointHost: host }, link: "/company-admin/integrations" });
}

/**
 * Tells a company's webhooks about something that happened. Never throws and never blocks the action: a delivery
 * row is written for every active endpoint subscribed to the event and sent in the background. Nothing is sent for
 * a company whose plan lacks ATS and API access, or that is outside a pilot.
 */
export async function emitWebhook(db: Db, companyId: string, event: WebhookEvent, data: Prisma.InputJsonValue, options: { fetchImpl?: Fetch; wait?: boolean } = {}): Promise<number> {
  try {
    const endpoints = await db.webhookEndpoint.findMany({ where: { companyId, isActive: true, events: { has: event } } });
    if (endpoints.length === 0) return 0;
    const [ent, pilot] = await Promise.all([getEntitlements(companyId), getPilot(db)]);
    if (!ent.canUseAts || pilotBlocksCompany(pilot, companyId)) return 0;
    const rows = await Promise.all(endpoints.map((e) => db.webhookDelivery.create({ data: { endpointId: e.id, event, payload: data } })));
    const sends = rows.map((r) => deliver(db, r.id, options.fetchImpl).catch((err) => console.error(`[webhook] delivery failed: ${err instanceof Error ? err.message : "unknown"}`)));
    if (options.wait) await Promise.all(sends);
    return rows.length;
  } catch (err) {
    console.error(`[webhook] could not queue ${event}: ${err instanceof Error ? err.message : "unknown"}`);
    return 0;
  }
}

/** Resends one delivery by hand (the company admin presses Resend). */
export async function resendDelivery(db: Db, args: { userId: string; deliveryId: string; fetchImpl?: Fetch }) {
  const admin = await adminFor(db, args.userId);
  const delivery = await db.webhookDelivery.findFirst({ where: { id: args.deliveryId, endpoint: { companyId: admin.companyId } } });
  if (!delivery) throw new AtsError(404, "NOT_FOUND", "Delivery not found.");
  await db.webhookDelivery.update({ where: { id: delivery.id }, data: { attempt: { increment: 1 }, status: "PENDING", nextAttemptAt: null } });
  return deliver(db, delivery.id, args.fetchImpl);
}

/** The scheduled retry: failed deliveries whose retry time has come and that still have attempts left. */
export async function retryDueDeliveries(db: Db, now = new Date(), fetchImpl: Fetch = fetch): Promise<{ retried: number; succeeded: number }> {
  const integrations = await readSetting(db, "integrations");
  const due = await db.webhookDelivery.findMany({ where: { status: "FAILED", nextAttemptAt: { lte: now }, attempt: { lt: integrations.webhookMaxAttempts } }, take: 200, orderBy: { nextAttemptAt: "asc" } });
  let succeeded = 0;
  for (const d of due) {
    await db.webhookDelivery.update({ where: { id: d.id }, data: { attempt: { increment: 1 }, status: "PENDING", nextAttemptAt: null } });
    if ((await deliver(db, d.id, fetchImpl, now))?.status === "SUCCESS") succeeded++;
  }
  return { retried: due.length, succeeded };
}

/** Sends a test event to one endpoint so the company can check its receiver and its signature check. */
export async function sendTestEvent(db: Db, args: { userId: string; endpointId: string; fetchImpl?: Fetch }) {
  const admin = await adminFor(db, args.userId);
  const endpoint = await db.webhookEndpoint.findFirst({ where: { id: args.endpointId, companyId: admin.companyId } });
  if (!endpoint) throw new AtsError(404, "NOT_FOUND", "Webhook not found.");
  const row = await db.webhookDelivery.create({ data: { endpointId: endpoint.id, event: "webhook.test", payload: { message: "This is a test event from Workforce Pro." } } });
  return deliver(db, row.id, args.fetchImpl);
}
