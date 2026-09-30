import Link from "next/link";
import type { CompanyAccess } from "@/lib/companyPlan";

const dateFormat = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** One-sentence plan/trial summary shared by the dashboard and the subscription page. */
export function accessSummary(a: CompanyAccess): string {
  switch (a.state) {
    case "trial":
      return `Free trial of the ${a.plan!.name} plan: ${a.daysLeft} day${a.daysLeft === 1 ? "" : "s"} left (ends ${dateFormat(a.endsAt!)}).`;
    case "ended":
      return "Your plan has ended, so searching and contacting candidates is switched off until you choose a plan.";
    case "none":
      return "Your company has no plan yet. Choose one to start searching and contacting candidates.";
    default:
      return a.endsAt ? `${a.plan!.name} plan, active until ${dateFormat(a.endsAt)}.` : `${a.plan!.name} plan, active.`;
  }
}

/** Amber call-to-action shown when a company is on a trial, or has no working plan. */
export default function PlanCallout({ access, href }: { access: CompanyAccess; href: string }) {
  if (access.state === "active") return null;
  return (
    <div role="status" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p>{accessSummary(access)}</p>
      <Link href={href} className="btn-primary">Upgrade plan</Link>
    </div>
  );
}
