import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 50;
const when = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const READABLE: Record<string, string> = {
  TEST_FOCUS_LOST: "Candidate left the test window",
  INTEGRITY_FLAG_CLEARED: "Integrity flag cleared",
  INTEGRITY_RESULT_VOIDED: "Result voided after integrity review",
  INTEGRITY_VOID_UNDONE: "Void undone",
  BADGE_REMOVED: "Badge removed",
};
const label = (action: string) => READABLE[action] ?? action.toLowerCase().replace(/_/g, " ");

/** The audit log: who did what and when. It records kinds of actions and ids, never passwords, salaries or answers. */
export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const one = (k: string) => (Array.isArray(raw[k]) ? raw[k]![0] : (raw[k] as string | undefined)) || undefined;
  const action = one("action")?.slice(0, 80);
  const who = one("who")?.trim().slice(0, 100);
  const page = Math.max(1, Number.parseInt(one("page") ?? "1", 10) || 1);

  const where: Prisma.AuditLogWhereInput = {
    ...(action ? { action } : {}),
    ...(who ? { actor: { OR: [{ email: { contains: who, mode: "insensitive" } }, { name: { contains: who, mode: "insensitive" } }] } } : {}),
  };
  const [actions, total, rows] = await Promise.all([
    prisma.auditLog.groupBy({ by: ["action"], _count: { _all: true }, orderBy: { action: "asc" } }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { actor: { select: { name: true, email: true, role: true } } } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const params = new URLSearchParams();
    if (action) params.set("action", action);
    if (who) params.set("who", who);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/admin/audit-log?${s}` : "/admin/audit-log";
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Audit log</h1>
      <p className="mt-1 text-zinc-600">Every admin action, every recruiter view of a candidate, and the other events that matter. Entries are never edited or deleted here.</p>

      <form method="get" className="card mt-5 flex flex-wrap items-end gap-3" aria-label="Filters">
        <div>
          <label htmlFor="a-action" className="label">What happened</label>
          <select id="a-action" name="action" className="input" defaultValue={action ?? ""}>
            <option value="">Anything</option>
            {actions.map((a) => <option key={a.action} value={a.action}>{label(a.action)} ({a._count._all})</option>)}
          </select>
        </div>
        <div className="min-w-48 flex-1">
          <label htmlFor="a-who" className="label">Who</label>
          <input id="a-who" name="who" className="input" defaultValue={who ?? ""} placeholder="Name or email" />
        </div>
        <button type="submit" className="btn-primary">Filter</button>
        {(action || who) && <Link href="/admin/audit-log" className="btn-secondary">Clear</Link>}
      </form>

      <p className="mt-4 text-sm text-zinc-600" aria-live="polite" data-testid="audit-count">{total} entr{total === 1 ? "y" : "ies"}</p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[52rem] text-left text-sm" data-testid="audit-table">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500"><tr><th className="px-3 py-3">When</th><th className="px-3 py-3">Who</th><th className="px-3 py-3">What</th><th className="px-3 py-3">About</th><th className="px-3 py-3">Details</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-zinc-600">Nothing matches.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} data-testid="audit-row">
                <td className="px-3 py-3 whitespace-nowrap">{when(r.createdAt)}</td>
                <td className="px-3 py-3">{r.actor ? <><p className="font-medium text-zinc-900">{r.actor.name ?? r.actor.email}</p><p className="text-xs text-zinc-500">{r.actor.role.toLowerCase().replace("_", " ")}</p></> : <span className="text-zinc-400">System</span>}</td>
                <td className="px-3 py-3">{label(r.action)}</td>
                <td className="px-3 py-3 text-xs text-zinc-600">{r.targetType}{r.targetId ? ` ${r.targetId.slice(0, 10)}` : ""}</td>
                <td className="max-w-72 break-words px-3 py-3 text-xs text-zinc-600">{r.metadata ? JSON.stringify(r.metadata).slice(0, 200) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href(page - 1)} className="btn-secondary">Previous</Link> : <span />}
          <span className="text-zinc-600">Page {page} of {pages}</span>
          {page < pages ? <Link href={href(page + 1)} className="btn-secondary">Next</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
