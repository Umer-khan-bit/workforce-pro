import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrency } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { latestResults } from "@/lib/results/latest";
import { loadRecommendations, recommendationsAreStale } from "@/lib/training/recommend";
import { TEST_TITLES } from "@/lib/testEngine/labels";
import RecommendationsPanel from "./RecommendationsPanel";

export default async function TrainingPage() {
  const session = await auth();
  const profile = await prisma.candidateProfile.findFirst({ where: { userId: session!.user.id, anonymisedAt: null }, select: { id: true, jobRoleId: true } });
  if (!profile) redirect("/login");

  const roleFilter = [{ jobRoleId: null }, ...(profile.jobRoleId ? [{ jobRoleId: profile.jobRoleId }] : [])];
  const [currency, enrollments, catalog, recs, stale, results] = await Promise.all([
    getCurrency(),
    prisma.enrollment.findMany({ where: { candidateProfileId: profile.id, course: { isActive: true } }, include: { course: { select: { id: true, title: true, testType: true } } }, orderBy: { enrolledAt: "desc" } }),
    prisma.course.findMany({
      where: { isActive: true, OR: roleFilter, enrollments: { none: { candidateProfileId: profile.id } } },
      include: { jobRole: { select: { name: true } }, _count: { select: { lessons: true } } },
      orderBy: [{ isFree: "desc" }, { title: "asc" }],
    }),
    loadRecommendations(prisma, profile.id),
    recommendationsAreStale(prisma, profile.id),
    latestResults(prisma, profile.id),
  ]);

  const price = (c: { isFree: boolean; price: number }) => (c.isFree ? "Free" : formatMoney(c.price, currency));
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const recommended = recs.flatMap((r) => {
    const c = byId.get(r.courseId);
    return c ? [{ id: c.id, title: c.title, reason: r.reason, priceLabel: price(c), helpsWith: c.testType ? TEST_TITLES[c.testType] : null }] : [];
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Training</h1>
      <p className="mt-1 text-zinc-600">Free and paid courses to strengthen the areas where you can improve. Finish a course, then retake the related test.</p>

      <div className="mt-6 flex flex-col gap-6">
        <RecommendationsPanel courses={recommended} stale={stale} hasResults={results.some((r) => r.quartile !== null)} />

        <section aria-labelledby="mine-h" data-testid="my-courses">
          <h2 id="mine-h" className="text-lg font-semibold text-zinc-900">My courses</h2>
          {enrollments.length === 0 ? (
            <p className="card mt-2 text-sm text-zinc-700">You have not joined a course yet.</p>
          ) : (
            <ul className="mt-2 grid gap-3 sm:grid-cols-2">
              {enrollments.map((e) => (
                <li key={e.id} className="card" data-testid="my-course">
                  <Link href={`/candidate/training/${e.course.id}`} className="font-medium text-brand-700 underline">{e.course.title}</Link>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={e.progressPercent} aria-label={`Progress in ${e.course.title}`}>
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${e.progressPercent}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-zinc-600">{e.status === "COMPLETED" ? "Completed" : `${e.progressPercent}% done`}</p>
                  {e.status === "COMPLETED" && e.course.testType && <p className="mt-1 text-xs"><Link href={`/candidate/tests`} className="text-brand-700 underline">Retake your {TEST_TITLES[e.course.testType]} test</Link></p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="catalog-h" data-testid="catalog">
          <h2 id="catalog-h" className="text-lg font-semibold text-zinc-900">All courses</h2>
          {catalog.length === 0 ? (
            <p className="card mt-2 text-sm text-zinc-700">There are no more courses for you right now.</p>
          ) : (
            <ul className="mt-2 grid gap-3 sm:grid-cols-2">
              {catalog.map((c) => (
                <li key={c.id} className="card flex flex-col" data-testid="catalog-course">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/candidate/training/${c.id}`} className="font-medium text-brand-700 underline">{c.title}</Link>
                    <span className={`badge ${c.isFree ? "bg-green-50 text-green-800" : "bg-zinc-100 text-zinc-800"}`}>{price(c)}</span>
                  </div>
                  {c.description && <p className="mt-1 text-sm text-zinc-700">{c.description}</p>}
                  <p className="mt-2 text-xs text-zinc-500">
                    {c._count.lessons} lessons{c.testType ? ` · helps with ${TEST_TITLES[c.testType]}` : ""}{c.jobRole ? ` · for ${c.jobRole.name}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
