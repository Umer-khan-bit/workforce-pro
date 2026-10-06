import type { Prisma, PrismaClient, WebhookDeliveryStatus } from "@prisma/client";
import { createApiKey } from "../src/lib/ats/apiKeys";
import { createEndpoint, WEBHOOK_EVENTS } from "../src/lib/ats/webhooks";
import { pushToAts } from "../src/lib/ats/push";
import { getEntitlements } from "../src/lib/recruiter/entitlements";

/**
 * Demo ATS activity so the company admin's "ATS & webhooks" and "API keys" screens, the recruiter's "ATS export" and
 * the mock ATS inbox are not empty: for each company whose plan includes ATS and API access, one API key, one webhook
 * pointing at the app's own demo receiver, a handful of shortlisted candidates pushed to the mock ATS (through the same
 * code the recruiters use), and a delivery log. Demo mode only; it does nothing if the company already has a webhook or key.
 */
export type DemoIntegrationsSummary = { companies: number; pushed: number; deliveries: number };

export async function seedDemoIntegrations(prisma: PrismaClient): Promise<DemoIntegrationsSummary> {
  if (process.env.DEMO_MODE !== "true") throw new Error("Refusing to create demo integrations: DEMO_MODE is not 'true'.");
  const summary: DemoIntegrationsSummary = { companies: 0, pushed: 0, deliveries: 0 };
  const base = process.env.APP_BASE_URL?.trim() || "http://localhost:7310";

  for (const company of await prisma.company.findMany({ orderBy: { name: "asc" } })) {
    if (!(await getEntitlements(company.id)).canUseAts) continue;
    if ((await prisma.webhookEndpoint.count({ where: { companyId: company.id } })) + (await prisma.apiKey.count({ where: { companyId: company.id } })) > 0) continue;
    const admin = await prisma.user.findFirst({ where: { companyId: company.id, role: "COMPANY_ADMIN", isActive: true }, orderBy: { email: "asc" } });
    if (!admin) continue;

    const shortlist = await prisma.shortlist.findMany({ where: { recruiter: { companyId: company.id } }, orderBy: { createdAt: "asc" }, select: { id: true }, take: 12 });
    const pushed = await pushToAts(prisma, { userId: admin.id, shortlistIds: shortlist.map((s) => s.id) }).catch(() => null);
    const exports = await prisma.atsExport.findMany({ where: { companyId: company.id, status: "SUCCESS" }, orderBy: { exportedAt: "asc" }, take: 6 });

    const key = await createApiKey(prisma, { userId: admin.id, label: "Demo ATS integration" });
    await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date(Date.now() - 3 * 3_600_000) } });
    const { id: endpointId } = await createEndpoint(prisma, { userId: admin.id, url: `${base}/api/mock-ats/receive`, events: WEBHOOK_EVENTS.map((e) => e.key).filter((k) => k !== "webhook.test") });

    // A delivery log made of the pushes above (all answered 200) plus one test event and one that did not get through.
    const day = 86_400_000;
    type Row = { event: string; payload: Prisma.InputJsonObject; status: WebhookDeliveryStatus; responseStatus: number | null; error: string | null; at: Date };
    const rows: Row[] = exports.map((e, i) => ({ event: "candidate.exported", payload: { externalId: e.externalId }, status: "SUCCESS", responseStatus: 200, error: null, at: new Date(Date.now() - (i + 1) * 0.4 * day) }));
    rows.push({ event: "webhook.test", payload: { test: true }, status: "SUCCESS", responseStatus: 200, error: null, at: new Date(Date.now() - 2 * day) });
    rows.push({ event: "candidate.hired", payload: { demo: true }, status: "FAILED", responseStatus: null, error: "The receiving server did not answer in time.", at: new Date(Date.now() - 3 * day) });
    for (const r of rows) {
      await prisma.webhookDelivery.create({ data: { endpointId, event: r.event, payload: r.payload, status: r.status, attempt: r.status === "FAILED" ? 5 : 1, respondedAt: r.at, createdAt: r.at, responseStatus: r.responseStatus, error: r.error } });
    }
    summary.companies++;
    summary.pushed += pushed?.pushed.length ?? 0;
    summary.deliveries += rows.length;
  }
  return summary;
}
