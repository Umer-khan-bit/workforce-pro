import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { appBaseUrl } from "@/lib/accountEmails";
import { WEBHOOK_EVENTS } from "@/lib/ats/webhooks";
import { STATUS_LABELS } from "@/lib/recruiter/shortlist";
import { getEntitlements, planBlockMessage } from "@/lib/recruiter/entitlements";
import WebhooksManager, { type DeliveryRow, type EndpointRow } from "./WebhooksManager";

const when = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** ATS and webhooks: where events are sent, the delivery log, and the built-in mock ATS inbox. */
export default async function IntegrationsPage() {
  const session = await auth();
  const companyId = session!.user.companyId!;
  const [ent, endpoints, deliveries, inbox] = await Promise.all([
    getEntitlements(companyId),
    prisma.webhookEndpoint.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } }),
    prisma.webhookDelivery.findMany({ where: { endpoint: { companyId } }, orderBy: { createdAt: "desc" }, take: 50, include: { endpoint: { select: { url: true } } } }),
    prisma.mockAtsCandidate.findMany({ where: { companyId }, orderBy: { receivedAt: "desc" }, take: 25 }),
  ]);
  const demo = process.env.DEMO_MODE === "true";
  const endpointRows: EndpointRow[] = endpoints.map((e) => ({ id: e.id, url: e.url, events: e.events, isActive: e.isActive }));
  const deliveryRows: DeliveryRow[] = deliveries.map((d) => ({ id: d.id, endpointUrl: d.endpoint.url, event: d.event, status: d.status, attempt: d.attempt, when: when(d.respondedAt ?? d.createdAt), responseStatus: d.responseStatus, error: d.error, nextAttempt: d.nextAttemptAt ? when(d.nextAttemptAt) : null }));

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold text-zinc-900">ATS &amp; webhooks</h1>
      <p className="mt-1 text-zinc-600">Connect your applicant tracking system. Recruiters push shortlisted candidates to it; webhooks tell your systems when something changes; <Link href="/company-admin/api-keys" className="text-brand-700 underline">API keys</Link> let your systems read the shortlist.</p>
      {!ent.canUseAts && <p role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="plan-blocked">{planBlockMessage(ent, "ATS and API access")}</p>}

      <h2 className="mt-6 text-lg font-semibold text-zinc-900">Webhooks</h2>
      <div className="mt-3">
        <WebhooksManager endpoints={endpointRows} deliveries={deliveryRows} events={WEBHOOK_EVENTS.map((e) => ({ key: e.key, label: e.label }))} canCreate={ent.canUseAts} demoReceiverUrl={demo ? `${appBaseUrl()}/api/mock-ats/receive` : null} />
      </div>

      <section className="mt-8" aria-labelledby="ats-h">
        <h2 id="ats-h" className="text-lg font-semibold text-zinc-900">{demo ? "Mock ATS" : "Your ATS"}</h2>
        <p className="mt-1 text-sm text-zinc-600">{demo ? "In demo mode, candidates pushed from a shortlist land here, like they would in a real ATS." : "No ATS connector is set up for this site yet."}</p>
        {demo && (
          <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full min-w-[34rem] text-left text-sm" data-testid="mock-ats-table">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500"><tr><th className="px-3 py-3">ATS id</th><th className="px-3 py-3">Candidate</th><th className="px-3 py-3">Job opening</th><th className="px-3 py-3">Stage</th><th className="px-3 py-3">Received</th></tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {inbox.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-zinc-600">Nothing has been pushed yet. Recruiters push from <strong>ATS export</strong>.</td></tr>}
                {inbox.map((c) => {
                  const p = c.payload as { status?: string; candidate?: { name?: string | null }; jobOpening?: { title?: string | null; jobRole?: string } };
                  return (
                    <tr key={c.id} data-testid="mock-ats-row">
                      <td className="px-3 py-3 font-mono text-xs">{c.externalId}</td>
                      <td className="px-3 py-3">{p.candidate?.name ?? "-"}</td>
                      <td className="px-3 py-3">{p.jobOpening?.title ?? p.jobOpening?.jobRole ?? "-"}</td>
                      <td className="px-3 py-3">{p.status ? (STATUS_LABELS as Record<string, string>)[p.status] ?? p.status : "-"}</td>
                      <td className="px-3 py-3">{when(c.receivedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
