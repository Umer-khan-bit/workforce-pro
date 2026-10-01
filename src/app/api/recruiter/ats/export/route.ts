import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { overLimit, tooManyRequests } from "@/lib/authLimits";
import { requireStaff } from "@/lib/recruiter/guards";
import { getEntitlements, planBlockMessage } from "@/lib/recruiter/entitlements";
import { EXPORT_HEADERS, toCsv, toRow, toXlsx } from "@/lib/ats/export";
import { loadAtsCandidates } from "@/lib/ats/payload";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  format: z.enum(["csv", "xlsx"]).default("csv"),
  status: z.enum(["SHORTLISTED", "CONTACTED", "INTERVIEWING", "OFFERED", "HIRED", "REJECTED"]).optional(),
  opening: z.string().min(1).max(60).optional(),
});

/**
 * The shortlist as a CSV or Excel file. Recruiters export their own shortlist, company admins the whole company's.
 * Needs the plan's ATS and API access; the export is audit-logged. Spreadsheet formulas in names are neutralised.
 */
export async function GET(request: Request) {
  const staff = await requireStaff(["RECRUITER", "COMPANY_ADMIN"]);
  if (staff instanceof NextResponse) return staff;
  if (await overLimit(`ats-export:${staff.userId}`, 30)) return tooManyRequests();
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const ent = await getEntitlements(staff.companyId);
  if (!ent.canUseAts) return NextResponse.json({ error: planBlockMessage(ent, "ATS and API access"), code: "PLAN_FEATURE_REQUIRED" }, { status: 403 });

  const candidates = await loadAtsCandidates(prisma, { companyId: staff.companyId, ...(staff.role === "RECRUITER" ? { recruiterId: staff.userId } : {}), status: parsed.data.status, openingId: parsed.data.opening, limit: 1000 });
  const rows = candidates.map(toRow);
  await prisma.auditLog.create({ data: { actorId: staff.userId, action: "SHORTLIST_EXPORTED", targetType: "Company", targetId: staff.companyId, metadata: { format: parsed.data.format, rows: rows.length } } });

  const stamp = new Date().toISOString().slice(0, 10);
  if (parsed.data.format === "xlsx") {
    return new NextResponse(Buffer.from(toXlsx(EXPORT_HEADERS, rows)), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="shortlist-${stamp}.xlsx"`, "Cache-Control": "no-store" },
    });
  }
  return new NextResponse(toCsv(EXPORT_HEADERS, rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="shortlist-${stamp}.csv"`, "Cache-Control": "no-store" },
  });
}
