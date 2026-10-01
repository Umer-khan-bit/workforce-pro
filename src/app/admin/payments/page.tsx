import Link from "next/link";
import type { PaymentPurpose, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrency } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import Stat from "@/components/Stat";

const PAGE_SIZE = 25;
const PURPOSES: { value: PaymentPurpose; label: string }[] = [{ value: "SUBSCRIPTION", label: "Subscriptions" }, { value: "COURSE", label: "Courses" }];
const STATUSES: { value: PaymentStatus; label: string }[] = [{ value: "SUCCESS", label: "Paid" }, { value: "FAILED", label: "Failed" }, { value: "PENDING", label: "Pending" }, { value: "REFUNDED", label: "Refunded" }];
const fmt = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** The payment ledger: every subscription and course payment, kept apart from the plans themselves. */
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const one = (k: string) => (Array.isArray(raw[k]) ? raw[k]![0] : (raw[k] as string | undefined)) || undefined;
  const purpose = PURPOSES.find((p) => p.value === one("purpose"))?.value;
  const status = STATUSES.find((s) => s.value === one("status"))?.value;
  const page = Math.max(1, Number.parseInt(one("page") ?? "1", 10) || 1);
  const where: Prisma.PaymentWhereInput = { ...(purpose ? { purpose } : {}), ...(status ? { status } : {}) };

  const [currency, total, payments, sums, counts] = await Promise.all([
    getCurrency(),
    prisma.payment.count({ where }),
    prisma.payment.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { company: { select: { id: true, name: true } }, plan: { select: { name: true } }, course: { select: { title: true } } } }),
    prisma.payment.groupBy({ by: ["purpose"], where: { status: "SUCCESS" }, _sum: { amount: true } }),
    prisma.payment.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const payerIds = payments.filter((p) => !p.companyId && p.userId).map((p) => p.userId!);
  const payers = payerIds.length ? await prisma.user.findMany({ where: { id: { in: payerIds } }, select: { id: true, name: true, candidateProfile: { select: { anonymisedAt: true } } } }) : [];
  const payerName = new Map(payers.map((u) => [u.id, u.candidateProfile?.anonymisedAt ? "Deleted account" : (u.name ?? "Candidate")]));

  const money = (n: number) => formatMoney(n, currency);
  const sum = (p: PaymentPurpose) => sums.find((s) => s.purpose === p)?._sum.amount ?? 0;
  const count = (s: PaymentStatus) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const params = new URLSearchParams();
    if (purpose) params.set("purpose", purpose);
    if (status) params.set("status", status);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/admin/payments?${s}` : "/admin/payments";
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Payments</h1>
      <p className="mt-1 text-zinc-600">Every subscription and course payment. In demo mode they come from the simulated gateway and no real money moves.</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="payment-stats">
        <Stat label="Subscriptions collected" value={money(sum("SUBSCRIPTION"))} />
        <Stat label="Courses collected" value={money(sum("COURSE"))} />
        <Stat label="Paid" value={count("SUCCESS")} />
        <Stat label="Failed" value={count("FAILED")} />
      </div>

      <form method="get" className="card mt-5 flex flex-wrap items-end gap-3" aria-label="Filters">
        <div>
          <label htmlFor="p-purpose" className="label">For</label>
          <select id="p-purpose" name="purpose" className="input" defaultValue={purpose ?? ""}>
            <option value="">Everything</option>
            {PURPOSES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="p-status" className="label">Status</label>
          <select id="p-status" name="status" className="input" defaultValue={status ?? ""}>
            <option value="">Any status</option>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <button type="submit" className="btn-primary">Filter</button>
        {(purpose || status) && <Link href="/admin/payments" className="btn-secondary">Clear</Link>}
      </form>

      <p className="mt-4 text-sm text-zinc-600" aria-live="polite" data-testid="payment-count">{total} payment{total === 1 ? "" : "s"}</p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[54rem] text-left text-sm" data-testid="payments-table">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr><th className="px-3 py-3">Date</th><th className="px-3 py-3">Paid by</th><th className="px-3 py-3">For</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Provider</th><th className="px-3 py-3">Reference</th></tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {payments.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-zinc-600">No payments match.</td></tr>}
            {payments.map((p) => (
              <tr key={p.id} data-testid="payment-row">
                <td className="px-3 py-3 whitespace-nowrap">{fmt(p.createdAt)}</td>
                <td className="px-3 py-3">{p.company ? <Link href={`/admin/companies/${p.company.id}`} className="text-brand-700 underline">{p.company.name}</Link> : (p.userId ? (payerName.get(p.userId) ?? "-") : "-")}</td>
                <td className="px-3 py-3">{p.purpose === "SUBSCRIPTION" ? `${p.plan?.name ?? "Plan"} plan` : (p.course?.title ?? "Course")}</td>
                <td className="px-3 py-3 tabular-nums">{formatMoney(p.amount, { code: p.currency, locale: currency.locale })}</td>
                <td className="px-3 py-3">{p.status === "SUCCESS" ? <span className="badge bg-green-50 text-green-800">Paid</span> : p.status === "FAILED" ? <span className="badge bg-red-50 text-red-700">Failed</span> : <span className="badge bg-zinc-100 text-zinc-700">{p.status.toLowerCase()}</span>}</td>
                <td className="px-3 py-3">{p.provider}</td>
                <td className="px-3 py-3 text-zinc-600">{p.providerReference ?? "-"}</td>
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
