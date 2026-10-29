import { prisma } from "@/lib/prisma";
import { reviewQueue, type ReviewRow } from "@/lib/integrity/review";
import { TEST_TITLES } from "@/lib/testEngine/labels";
import { listConcerns, type ConcernRow } from "@/lib/integrity/concerns";
import ReviewButtons from "./ReviewButtons";
import ConcernButton from "./ConcernButton";

const when = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function Table({ rows, mode, empty }: { rows: ReviewRow[]; mode: "waiting" | "voided"; empty: string }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
      <table className="w-full min-w-[40rem] text-left text-sm" data-testid={`integrity-${mode}`}>
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr><th className="px-3 py-3">Candidate</th><th className="px-3 py-3">Test</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Window exits</th><th className="px-3 py-3">Action</th></tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-zinc-600">{empty}</td></tr>}
          {rows.map((r) => (
            <tr key={r.sessionId} data-testid="integrity-row">
              <td className="px-3 py-3 font-medium text-zinc-900">{r.candidate}</td>
              <td className="px-3 py-3">{TEST_TITLES[r.testType]}</td>
              <td className="px-3 py-3 whitespace-nowrap">{when(r.date)}</td>
              <td className="px-3 py-3 tabular-nums">{r.exits}</td>
              <td className="px-3 py-3"><ReviewButtons sessionId={r.sessionId} mode={mode} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Concerns({ rows, reviewed, empty }: { rows: ConcernRow[]; reviewed?: boolean; empty: string }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
      <table className="w-full min-w-[56rem] text-left text-sm" data-testid={reviewed ? "concerns-reviewed" : "concerns-open"}>
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr><th className="px-3 py-3">Company</th><th className="px-3 py-3">Recruiter</th><th className="px-3 py-3">Candidate</th><th className="px-3 py-3">Test</th><th className="px-3 py-3">Reason</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">{reviewed ? "Reviewed" : "Action"}</th></tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-zinc-600">{empty}</td></tr>}
          {rows.map((r) => (
            <tr key={r.id} data-testid="concern-row">
              <td className="px-3 py-3 font-medium text-zinc-900">{r.company}</td>
              <td className="px-3 py-3">{r.recruiter}</td>
              <td className="px-3 py-3">{r.candidate}</td>
              <td className="px-3 py-3">{TEST_TITLES[r.testType]}</td>
              <td className="max-w-80 break-words px-3 py-3 text-zinc-700">{r.reason}</td>
              <td className="px-3 py-3 whitespace-nowrap">{when(r.createdAt)}</td>
              <td className="px-3 py-3">{reviewed ? `${r.reviewedAt ? when(r.reviewedAt) : ""}${r.reviewedBy ? ` by ${r.reviewedBy}` : ""}` : <ConcernButton id={r.id} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Tests where the candidate left the window often enough to be flagged (Settings > Tests). An admin decides what happens. */
export default async function IntegrityReviewPage() {
  const [{ waiting, voided, threshold }, concerns] = await Promise.all([reviewQueue(prisma), listConcerns(prisma)]);
  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold text-zinc-900">Integrity review</h1>
      <p className="mt-1 text-zinc-600">
        Finished tests where the candidate left the test window {threshold} time{threshold === 1 ? "" : "s"} or more (the number is a setting under Settings &gt; Tests). Leaving the window is not proof of cheating, so look before you decide.
        <strong> Clear flag</strong> keeps the result and stops showing the flag. <strong>Void result</strong> removes the result from rankings, search, reports and exports, withdraws a Top Performer badge that depended on it, and lets the candidate take the test again at once.
      </p>
      <h2 className="mt-6 text-lg font-semibold text-zinc-900">Reported by companies</h2>
      <p className="text-sm text-zinc-600">A recruiter reported a concern about a result. One result is shared by all companies, so only you can clear or void it (use the lists below). Mark a report reviewed once you have looked at it.</p>
      <Concerns rows={concerns.open} empty="No company has reported a concern." />
      {concerns.reviewed.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-semibold text-zinc-800">Reviewed reports</h3>
          <Concerns rows={concerns.reviewed} reviewed empty="" />
        </>
      )}
      <h2 className="mt-8 text-lg font-semibold text-zinc-900">Waiting for review</h2>
      <Table rows={waiting} mode="waiting" empty="Nothing is waiting for review." />
      <h2 className="mt-8 text-lg font-semibold text-zinc-900">Voided results</h2>
      <p className="text-sm text-zinc-600">Made a mistake? Undo void puts the result back and returns the test to the waiting list.</p>
      <Table rows={voided} mode="voided" empty="No results have been voided." />
    </div>
  );
}
