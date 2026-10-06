import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrency, getSetting } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { getEntitlements, planBlockMessage } from "@/lib/recruiter/entitlements";
import { resolveOffer } from "@/lib/recruiter/guards";
import { RANKED_TESTS, searchCandidates, SORTS, type SearchSort } from "@/lib/recruiter/search";
import { buildSearchQuery, parseSearchQuery, TEST_PARAMS } from "@/lib/recruiter/searchParams";
import { TEST_TITLES } from "@/lib/testEngine/labels";
import AiSearchBox from "./AiSearchBox";
import { aiSearchExample } from "@/lib/recruiter/aiSearchExample";
import ShortlistControl from "./ShortlistControl";

const SORT_LABELS: Record<SearchSort, string> = { overall: "Best overall", experience: "Most experience", iq: "IQ", eq: "EQ", language: "Language", skill: "Job skill" };
const QUARTILE_STYLE: Record<number, string> = { 1: "bg-green-100 text-green-900", 2: "bg-teal-50 text-teal-900", 3: "bg-amber-50 text-amber-900", 4: "bg-red-50 text-red-800" };

export default async function CandidateSearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const session = await auth();
  const companyId = session!.user.companyId!;
  const query = parseSearchQuery(raw);
  const aiNote = typeof raw.ai === "string" ? raw.ai.slice(0, 600) : null;

  const [ent, currency, tools, rule, openings, roles, cities] = await Promise.all([
    getEntitlements(companyId),
    getCurrency(),
    getSetting("recruiterTools"),
    getSetting("topPerformer"),
    prisma.jobOpening.findMany({ where: { companyId, status: "OPEN" }, include: { jobRole: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.jobRole.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.city.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const cityNames = [...new Set(cities.map((c) => c.name))];
  const { offerMax, openingId, source, opening: offerOpening } = await resolveOffer(prisma, companyId, { recruiterId: session!.user.id, openingId: query.opening, offer: query.offer });
  const money = (n: number) => formatMoney(n, currency);
  const openingOptions = openings.map((o) => ({ id: o.id, label: `${o.title ?? o.jobRole.name}${o.city ? `, ${o.city}` : ""}` }));

  const result =
    ent.canSearch && offerMax !== null
      ? await searchCandidates(prisma, { offerMax, filters: query.filters, sort: query.sort, page: query.page, pageSize: tools.pageSize, poolLimit: tools.searchPoolLimit, rule, canSeeTopPerformers: ent.canSeeTopPerformers })
      : null;

  const keep = { filters: query.filters, sort: query.sort, offer: query.offer, opening: openingId };
  const href = (page: number) => `/recruiter/candidates?${buildSearchQuery({ ...keep, page })}`;
  const detailHref = (id: string) => `/recruiter/candidates/${id}?${buildSearchQuery({ offer: query.offer ?? offerMax, opening: openingId })}`;
  const shortlisted = result
    ? await prisma.shortlist.findMany({ where: { recruiterId: session!.user.id, candidateProfileId: { in: result.rows.map((r) => r.id) }, status: { notIn: ["REJECTED"] } }, select: { candidateProfileId: true, jobOpeningId: true } })
    : [];

  const f = query.filters;
  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Candidate search</h1>
      <p className="mt-1 text-zinc-600">Assessed candidates ranked by their test results. You only see candidates whose salary expectations fit your offer.</p>

      {!ent.canSearch ? (
        <p role="alert" className="mt-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="plan-blocked">{planBlockMessage(ent, "candidate search")}</p>
      ) : (
        <div className="mt-5 flex flex-col gap-5">
          <AiSearchBox example={aiSearchExample(roles[0]?.name, cities[0]?.name)} offer={query.offer ?? offerMax} opening={openingId} enabled={ent.canUseAiSearch} blockedMessage={planBlockMessage(ent, "AI search")} />
          {aiNote && <p role="status" className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900" data-testid="ai-understood"><strong>AI understood:</strong> {aiNote}</p>}

          <form method="get" className="card grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filters">
            <div>
              <label htmlFor="s-opening" className="label">Job opening</label>
              <select id="s-opening" name="opening" className="input" defaultValue={source === "opening" ? (openingId ?? "") : ""}>
                <option value="">{offerOpening && source === "default" ? "Most recent open job opening (default)" : "None (use the amount)"}</option>
                {openings.map((o) => <option key={o.id} value={o.id}>{o.title ?? o.jobRole.name} - up to {money(o.salaryRangeMax)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="s-offer" className="label">Highest salary you can offer</label>
              <input id="s-offer" name="offer" type="number" min={1} className="input" defaultValue={query.offer ?? ""} placeholder={offerMax ? String(offerMax) : "Monthly amount"} />
            </div>
            <div>
              <label htmlFor="s-role" className="label">Job role</label>
              <select id="s-role" name="role" className="input" defaultValue={f.jobRoleId ?? ""}>
                <option value="">Any role</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="s-city" className="label">City</label>
              <select id="s-city" name="city" className="input" defaultValue={f.city ?? ""}>
                <option value="">Any city</option>
                {cityNames.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="s-min" className="label">Experience from (years)</label>
              <input id="s-min" name="minExp" type="number" min={0} max={60} className="input" defaultValue={f.minExperience ?? ""} />
            </div>
            <div>
              <label htmlFor="s-max" className="label">Experience up to (years)</label>
              <input id="s-max" name="maxExp" type="number" min={0} max={60} className="input" defaultValue={f.maxExperience ?? ""} />
            </div>
            {RANKED_TESTS.map((t) => (
              <div key={t}>
                <label htmlFor={`s-q-${t}`} className="label">{TEST_TITLES[t]} quartile</label>
                <select id={`s-q-${t}`} name={`q_${TEST_PARAMS[t]}`} className="input" defaultValue={f.quartiles?.[t] ?? ""}>
                  <option value="">Any</option>
                  <option value="1">Q1 only</option>
                  <option value="2">Q2 or better</option>
                  <option value="3">Q3 or better</option>
                </select>
              </div>
            ))}
            <div>
              <label htmlFor="s-sort" className="label">Sort by</label>
              <select id="s-sort" name="sort" className="input" defaultValue={query.sort}>
                {SORTS.map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-800">
                <input type="checkbox" name="top" value="1" defaultChecked={f.topPerformersOnly} className="size-4" />
                Q1 in all tests (Top Performers)
              </label>
            </div>
            <div className="flex items-end gap-3 sm:col-span-2">
              <button type="submit" className="btn-primary">Search</button>
              <Link href="/recruiter/candidates" className="btn-secondary">Clear</Link>
            </div>
          </form>

          {source === "default" && offerOpening && (
            <p role="status" className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900" data-testid="default-offer">
              Using your most recent open job opening: <strong>{offerOpening.label}</strong>, up to {money(offerOpening.salaryRangeMax)}. Pick another job opening or type an amount below to change it.
            </p>
          )}

          {offerMax === null && (
            <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="no-offer">
              You have no open job opening. Create one, or enter the highest salary you can offer, to see candidates. Candidates are only shown when their salary expectations fit your offer.{" "}
              <Link href="/recruiter/job-openings" className="underline">Job openings</Link>
            </p>
          )}

          {result && (
            <section aria-labelledby="results-h">
              <h2 id="results-h" className="text-sm text-zinc-600" aria-live="polite" data-testid="result-count">
                <strong className="text-zinc-900">{result.total}</strong> candidate{result.total === 1 ? "" : "s"} fit an offer of {money(offerMax!)}
                {result.poolTruncated ? " (the search looked at the first part of a very large pool: narrow it with filters)" : ""}
              </h2>
              {result.hiddenTopPerformers > 0 && (
                <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900" data-testid="hidden-top">
                  {result.hiddenTopPerformers} Top Performer{result.hiddenTopPerformers === 1 ? " matches" : "s match"} this search but {result.hiddenTopPerformers === 1 ? "is" : "are"} only open to plans with exclusive Q1 access.
                  {" "}<Link href="/company-admin/subscription" className="underline">See plans</Link> (your company admin can upgrade).
                </p>
              )}
              {result.rows.length === 0 ? (
                <p className="card mt-3 text-sm text-zinc-700">No candidates match. Try fewer filters or a higher offer.</p>
              ) : (
                <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
                  <table className="w-full min-w-[56rem] text-left text-sm" data-testid="candidate-table">
                    <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="px-3 py-3">Candidate</th>
                        <th className="px-3 py-3">Role</th>
                        <th className="px-3 py-3">City</th>
                        <th className="px-3 py-3">Experience</th>
                        {RANKED_TESTS.map((t) => <th key={t} className="px-3 py-3">{TEST_TITLES[t]}</th>)}
                        <th className="px-3 py-3">Overall</th>
                        <th className="px-3 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {result.rows.map((r) => (
                        <tr key={r.id} data-testid="candidate-row">
                          <td className="px-3 py-3">
                            <Link href={detailHref(r.id)} className="font-medium text-brand-700 underline">{r.name ?? "Candidate"}</Link>
                            {r.topPerformer && <span className="badge ml-2 bg-green-100 text-green-900">Top Performer</span>}
                          </td>
                          <td className="px-3 py-3">{r.jobRole ?? "-"}</td>
                          <td className="px-3 py-3">{r.city ?? "-"}</td>
                          <td className="px-3 py-3">{r.experienceYears !== null ? `${r.experienceYears} yrs` : "-"}</td>
                          {RANKED_TESTS.map((t) => {
                            const q = r.quartiles[t];
                            return (
                              <td key={t} className="px-3 py-3">
                                {typeof q === "number" ? <span className={`badge ${QUARTILE_STYLE[q]}`}>Q{q}</span> : <span className="text-zinc-400">-</span>}
                              </td>
                            );
                          })}
                          <td className="px-3 py-3 tabular-nums">{r.overall !== null ? r.overall.toFixed(0) : "-"}</td>
                          <td className="px-3 py-3">
                            <ShortlistControl candidateId={r.id} openings={openingOptions} shortlistedIn={shortlisted.filter((s) => s.candidateProfileId === r.id).map((s) => s.jobOpeningId)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {result.pages > 1 && (
                <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
                  {result.page > 1 ? <Link href={href(result.page - 1)} className="btn-secondary">Previous</Link> : <span />}
                  <span className="text-zinc-600">Page {result.page} of {result.pages}</span>
                  {result.page < result.pages ? <Link href={href(result.page + 1)} className="btn-secondary">Next</Link> : <span />}
                </nav>
              )}
              <p className="mt-3 text-xs text-zinc-500">Quartile Q1 is the highest group and Q4 the lowest. Overall is the average percentile across the tests that count for Top Performers. Names are shown; phone, email and salary expectations stay private until a candidate accepts your request.</p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
