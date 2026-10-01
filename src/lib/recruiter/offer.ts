import type { PrismaClient } from "@prisma/client";

export type ResolvedOffer = {
  offerMax: number | null;
  openingId: string | null;
  /** Where the offer came from: a job opening they chose, an amount they typed, or the default (their most recent open job opening). */
  source: "opening" | "typed" | "default" | null;
  /** The job opening the offer comes from, when it comes from one. */
  opening: { id: string; label: string; salaryRangeMax: number } | null;
};

/**
 * The offer a recruiter is searching with, which is what the minimum-salary rule is checked against: the top
 * salary of a chosen job opening, or an amount they typed. When neither is given it defaults to the top salary of
 * the recruiter's most recent OPEN job opening (or, for someone with none of their own, the company's most recent),
 * so a search is never empty by default; `opening` says which one so the page can show it. Null means the company
 * has no open job opening at all.
 */
export async function resolveOffer(
  db: Pick<PrismaClient, "jobOpening">,
  companyId: string,
  args: { openingId?: string | null; offer?: number | null; recruiterId?: string | null }
): Promise<ResolvedOffer> {
  const label = (o: { title: string | null; city: string | null; jobRole: { name: string } }) => `${o.title ?? o.jobRole.name}${o.city ? `, ${o.city}` : ""}`;
  const include = { jobRole: { select: { name: true } } } as const;

  if (args.openingId) {
    const o = await db.jobOpening.findFirst({ where: { id: args.openingId, companyId }, include });
    if (o) return { offerMax: o.salaryRangeMax, openingId: o.id, source: "opening", opening: { id: o.id, label: label(o), salaryRangeMax: o.salaryRangeMax } };
  }
  if (typeof args.offer === "number" && Number.isFinite(args.offer) && args.offer > 0) {
    return { offerMax: Math.round(args.offer), openingId: null, source: "typed", opening: null };
  }
  const recent =
    (args.recruiterId ? await db.jobOpening.findFirst({ where: { companyId, createdById: args.recruiterId, status: "OPEN" }, orderBy: { createdAt: "desc" }, include }) : null) ??
    (await db.jobOpening.findFirst({ where: { companyId, status: "OPEN" }, orderBy: { createdAt: "desc" }, include }));
  if (!recent) return { offerMax: null, openingId: null, source: null, opening: null };
  return { offerMax: recent.salaryRangeMax, openingId: recent.id, source: "default", opening: { id: recent.id, label: label(recent), salaryRangeMax: recent.salaryRangeMax } };
}
