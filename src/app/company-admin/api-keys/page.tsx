import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { appBaseUrl } from "@/lib/accountEmails";
import { getEntitlements, planBlockMessage } from "@/lib/recruiter/entitlements";
import { getSetting } from "@/lib/settings";
import ApiKeysManager, { type KeyRow } from "./ApiKeysManager";

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Company API keys for the company's own systems (ATS). Keys are shown once, stored hashed, and can be revoked. */
export default async function ApiKeysPage() {
  const session = await auth();
  const companyId = session!.user.companyId!;
  const [ent, keys, integrations] = await Promise.all([
    getEntitlements(companyId),
    prisma.apiKey.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } }),
    getSetting("integrations"),
  ]);
  const rows: KeyRow[] = keys.map((k) => ({ id: k.id, label: k.label ?? "Untitled", prefix: k.prefix ?? "wfp_", createdAt: fmt(k.createdAt), lastUsedAt: k.lastUsedAt ? fmt(k.lastUsedAt) : null, revoked: k.revokedAt !== null }));
  const base = appBaseUrl();

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-zinc-900">API keys</h1>
      <p className="mt-1 text-zinc-600">Let your own systems, such as an applicant tracking system, read your shortlist and report stage changes back. Each key belongs to your company, is shown once, and can be revoked at any time.</p>

      {!ent.canUseAts && <p role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="plan-blocked">{planBlockMessage(ent, "ATS and API access")}</p>}
      <div className="mt-5"><ApiKeysManager rows={rows} canCreate={ent.canUseAts} /></div>
      <p className="mt-2 text-xs text-zinc-500">Up to {integrations.maxApiKeys} active keys. Each key may make {integrations.apiRequestsPerMinute} requests a minute.</p>

      <section className="card mt-6" aria-labelledby="api-docs-h">
        <h2 id="api-docs-h" className="font-semibold text-zinc-900">Using the API</h2>
        <p className="mt-1 text-sm text-zinc-700">Send the key in the <code>Authorization</code> header. Answers are JSON.</p>
        <dl className="mt-3 space-y-3 text-sm">
          <div><dt className="font-medium text-zinc-900"><code>GET {base}/api/v1/shortlist</code></dt><dd className="text-zinc-600">Your shortlisted candidates. Optional: <code>?status=HIRED</code>, <code>?opening=&lt;id&gt;</code>, <code>?limit=100</code>. Contact details appear only for candidates who accepted your request; salary expectations are never included.</dd></div>
          <div><dt className="font-medium text-zinc-900"><code>POST {base}/api/v1/shortlist/&lt;reference&gt;/status</code></dt><dd className="text-zinc-600">Body <code>{`{"status":"INTERVIEWING"}`}</code>. Moves the candidate to another stage (SHORTLISTED, CONTACTED, INTERVIEWING, OFFERED, HIRED, REJECTED).</dd></div>
          <div><dt className="font-medium text-zinc-900"><code>GET {base}/api/v1/job-openings</code></dt><dd className="text-zinc-600">Your job openings.</dd></div>
        </dl>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-100">{`curl -H "Authorization: Bearer wfp_..." ${base}/api/v1/shortlist?status=OFFERED`}</pre>
      </section>
    </div>
  );
}
