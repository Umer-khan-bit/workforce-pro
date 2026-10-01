import Link from "next/link";
import { BarList, ColumnChart, FunnelChart } from "@/components/charts/charts";
import type { Slice } from "@/lib/reports/candidates";
import type { hiringReport } from "@/lib/reports/hiring";
import { STATUS_LABELS } from "@/lib/recruiter/shortlist";

type HiringData = Awaited<ReturnType<typeof hiringReport>>;

export const PERIODS = [30, 90, 180, 365];

/** Reads ?days= from the address and keeps it to a sensible range (falls back to the setting). */
export function readDays(raw: string | string[] | undefined, fallback: number): number {
  const s = Array.isArray(raw) ? raw[0] : raw;
  const n = s && /^\d+$/.test(s) ? Number(s) : fallback;
  return Math.min(730, Math.max(7, n));
}

/** Links to switch the period of a report. */
export function PeriodPicker({ base, days }: { base: string; days: number }) {
  const options = [...new Set([...PERIODS, days])].sort((a, b) => a - b);
  return (
    <nav aria-label="Report period" className="mt-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-zinc-600">Period:</span>
      {options.map((d) => (
        <Link key={d} href={`${base}?days=${d}`} aria-current={d === days ? "page" : undefined} className={`rounded-full border px-3 py-1 ${d === days ? "border-brand-700 bg-brand-700 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"}`}>
          Last {d} days
        </Link>
      ))}
    </nav>
  );
}

/** Hiring funnel, time to hire and activity over time. */
export function HiringSection({ data, days, who }: { data: HiringData; days: number; who: string }) {
  const { funnel, timeToHire } = data;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="hiring-section">
      <FunnelChart
        title="Hiring funnel"
        hint={`${who} shortlisted in the last ${days} days: how many reached each stage`}
        steps={funnel.steps.map((s) => ({ label: STATUS_LABELS[s.status], count: s.count }))}
        testId="funnel"
        footer={<p className="mt-2 text-xs text-zinc-500">{funnel.rejected} rejected along the way.</p>}
      />
      <section className="card min-w-0" aria-label="Time to hire" data-testid="time-to-hire">
        <h3 className="font-semibold text-zinc-900">Time to hire</h3>
        <p className="mt-0.5 text-xs text-zinc-500">Days from shortlisting to hiring</p>
        {timeToHire.hires === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No hires in this period yet.</p>
        ) : (
          <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div><dt className="text-zinc-500">Average</dt><dd className="text-2xl font-semibold text-zinc-900" data-testid="avg-days">{timeToHire.averageDays} <span className="text-sm font-normal">days</span></dd></div>
            <div><dt className="text-zinc-500">Median</dt><dd className="text-2xl font-semibold text-zinc-900">{timeToHire.medianDays} <span className="text-sm font-normal">days</span></dd></div>
            <div><dt className="text-zinc-500">Hires</dt><dd className="text-2xl font-semibold text-zinc-900">{timeToHire.hires}</dd></div>
          </dl>
        )}
      </section>
      <div className="lg:col-span-2">
        <ColumnChart
          title="Shortlisted and hired over time"
          hint={`Per ${days > 120 ? "month" : "week"}`}
          labels={data.shortlisted.map((b) => b.label)}
          series={[
            { name: "Shortlisted", color: "var(--color-brand-600)", values: data.shortlisted.map((b) => b.count) },
            { name: "Hired", color: "var(--color-brand-900)", values: data.hired.map((b) => b.count) },
          ]}
          empty="No shortlisting activity in this period."
          testId="activity"
        />
      </div>
    </div>
  );
}

/** Candidates by city and role, and the quartile spread for each test. */
export function CandidateSection({ title, city, role, quartiles }: { title: string; city: Slice[]; role: Slice[]; quartiles: { test: string; slices: Slice[] }[] }) {
  return (
    <section aria-label={title} data-testid="candidate-section">
      <h2 className="mt-8 text-lg font-semibold text-zinc-900">{title}</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarList title="Candidates by city" data={city} testId="by-city" />
        <BarList title="Candidates by job role" data={role} testId="by-role" />
        {quartiles.map((q) => (
          <ColumnChart key={q.test} title={`${q.test}: quartile distribution`} hint="Latest result of each candidate" labels={q.slices.map((s) => s.label)} series={[{ name: q.test, color: "var(--color-brand-600)", values: q.slices.map((s) => s.value) }]} testId={`quartiles-${q.test}`} />
        ))}
      </div>
    </section>
  );
}
