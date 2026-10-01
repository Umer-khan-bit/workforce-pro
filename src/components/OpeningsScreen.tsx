import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrency } from "@/lib/settings";
import { getEntitlements } from "@/lib/recruiter/entitlements";
import OpeningsManager, { type OpeningRow } from "@/components/OpeningsManager";

/**
 * The job openings screen shared by recruiters (their own openings) and company admins (every opening in the
 * company, with who created it). The plan limit on open openings is shown, and enforced by the server.
 */
export default async function OpeningsScreen({ role }: { role: "RECRUITER" | "COMPANY_ADMIN" }) {
  const session = await auth();
  const companyId = session!.user.companyId!;
  const userId = session!.user.id;

  const [openings, roles, cities, ent, currency] = await Promise.all([
    prisma.jobOpening.findMany({
      where: { companyId, ...(role === "RECRUITER" ? { createdById: userId } : {}) },
      include: { jobRole: { select: { name: true } }, createdBy: { select: { name: true } }, _count: { select: { shortlists: true, contactRequests: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    prisma.jobRole.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.city.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    getEntitlements(companyId),
    getCurrency(),
  ]);
  const open = await prisma.jobOpening.count({ where: { companyId, status: "OPEN" } });
  const limitNote =
    ent.openingLimit === null
      ? `${open} open job opening${open === 1 ? "" : "s"} in your company. Your plan has no limit.`
      : `${open} of ${ent.openingLimit} open job openings used in your company.`;

  const rows: OpeningRow[] = openings.map((o) => ({
    id: o.id,
    title: o.title ?? "",
    jobRoleId: o.jobRoleId,
    roleName: o.jobRole.name,
    city: o.city ?? "",
    salaryRangeMin: o.salaryRangeMin,
    salaryRangeMax: o.salaryRangeMax,
    status: o.status,
    createdBy: o.createdBy.name ?? "-",
    createdAt: o.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    shortlisted: o._count.shortlists,
    requests: o._count.contactRequests,
    canEdit: role === "COMPANY_ADMIN" || o.createdById === userId,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Job openings</h1>
      <p className="mt-1 text-zinc-600">
        {role === "COMPANY_ADMIN" ? "Every job opening in your company, whoever created it." : "Your job openings. The highest salary you can offer decides which candidates you can see and contact."}
      </p>
      <div className="mt-5">
        <OpeningsManager rows={rows} roles={roles.map((r) => ({ id: r.id, name: r.name }))} cities={[...new Set(cities.map((c) => c.name))]} moneyCode={currency.code} showOwner={role === "COMPANY_ADMIN"} limitNote={limitNote} />
      </div>
    </div>
  );
}
