import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrency } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { loadSalaryGuide } from "@/lib/salary/guide";
import { TEST_TITLES } from "@/lib/testEngine/labels";

export default async function SalaryGuidePage() {
  const session = await auth();
  const profile = await prisma.candidateProfile.findFirst({ where: { userId: session!.user.id, anonymisedAt: null }, select: { id: true } });
  if (!profile) redirect("/login");

  const [guide, currency] = await Promise.all([loadSalaryGuide(prisma, profile.id), getCurrency()]);
  const money = (n: number) => formatMoney(n, currency);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900">Salary guide</h1>
      <p className="mt-1 text-zinc-600">A monthly salary range for your job role, city and experience, adjusted by your assessment results.</p>

      {guide.status === "INCOMPLETE_PROFILE" && (
        <section className="card mt-6" role="status">
          <p className="font-medium text-zinc-900">Complete your profile to see your salary guide.</p>
          <p className="mt-1 text-sm text-zinc-700">We still need your {guide.missing.join(", ")}.</p>
          <p className="mt-4"><Link href="/candidate/profile" className="btn-primary">Complete my profile</Link></p>
        </section>
      )}

      {guide.status === "NO_DATA" && (
        <section className="card mt-6" role="status">
          <p className="font-medium text-zinc-900">There is no salary data for {guide.roleName} yet ({guide.bandLabel}).</p>
          <p className="mt-1 text-sm text-zinc-700">Salary figures are added by the platform team. Please check back later.</p>
        </section>
      )}

      {guide.status === "OK" && (
        <>
          <section className="card mt-6" aria-labelledby="sg-h" data-testid="salary-guide">
            <h2 id="sg-h" className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Suggested monthly range</h2>
            <p className="mt-2 text-3xl font-semibold text-zinc-900" data-testid="suggested-range">
              {money(guide.numbers.suggestedMin)} <span className="text-zinc-400">to</span> {money(guide.numbers.suggestedMax)}
            </p>
            <p className="mt-1 text-sm text-zinc-600">Around {money(guide.numbers.suggestedMid)} a month for {guide.roleName} in {guide.allCitiesFallback ? "all cities" : guide.city}, {guide.bandLabel} of experience.</p>

            <div className="mt-5">
              <div className="relative h-3 rounded-full bg-zinc-100" role="img" aria-label={`Suggested range ${money(guide.numbers.suggestedMin)} to ${money(guide.numbers.suggestedMax)} within the market range ${money(guide.market.min)} to ${money(guide.market.max)}`}>
                {(() => {
                  const span = Math.max(1, guide.market.max - guide.market.min);
                  const left = ((guide.numbers.suggestedMin - guide.market.min) / span) * 100;
                  const width = Math.max(2, ((guide.numbers.suggestedMax - guide.numbers.suggestedMin) / span) * 100);
                  return <div className="absolute h-3 rounded-full bg-brand-600" style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }} />;
                })()}
              </div>
              <div className="mt-1 flex justify-between text-xs text-zinc-500">
                <span>Market low {money(guide.market.min)}</span>
                <span>Average {money(guide.market.avg)}</span>
                <span>Market high {money(guide.market.max)}</span>
              </div>
            </div>
          </section>

          <section className="card mt-4" aria-labelledby="how-h">
            <h2 id="how-h" className="text-sm font-semibold uppercase tracking-wide text-zinc-500">How this was worked out</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
              <li>Market figures for {guide.roleName}, {guide.allCitiesFallback ? `all cities (there is no figure for ${guide.city} yet)` : guide.city}, {guide.bandLabel}.</li>
              {guide.usedTests.length > 0 ? (
                <li>Your results: {guide.usedTests.map((t) => `${TEST_TITLES[t.testType]} Q${t.quartile}`).join(", ")}. Stronger results move the suggestion up within the market range.</li>
              ) : (
                <li>You have no ranked results yet, so the market average is shown. <Link href="/candidate/tests" className="text-brand-700 underline">Take your tests</Link> to personalise it.</li>
              )}
            </ul>
          </section>

          {guide.minimumSalary !== null && guide.minimumVsRange && (
            <section className="card mt-4" aria-labelledby="min-h" data-testid="minimum-comparison">
              <h2 id="min-h" className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Your minimum salary</h2>
              <p className="mt-2 text-sm text-zinc-800">
                You have set a minimum of <strong>{money(guide.minimumSalary)}</strong>.{" "}
                {guide.minimumVsRange === "BELOW" && "That is below the suggested range, so more offers will fit it."}
                {guide.minimumVsRange === "WITHIN" && "That is inside the suggested range."}
                {guide.minimumVsRange === "ABOVE" && "That is above the suggested range, so fewer offers will fit it."}
              </p>
              <p className="mt-2 text-sm text-zinc-600">Recruiters only see and contact you when their offer meets your minimum. You can change it in <Link href="/candidate/profile" className="text-brand-700 underline">Profile &amp; privacy</Link>.</p>
            </section>
          )}

          <p className="mt-4 text-xs text-zinc-500">{guide.disclaimer}</p>
        </>
      )}
    </div>
  );
}
