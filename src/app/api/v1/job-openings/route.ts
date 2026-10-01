import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey } from "@/lib/ats/v1";

/** The company's job openings. Authorization: Bearer <API key>. */
export async function GET(request: Request) {
  return withApiKey(request, async (caller) => {
    const openings = await prisma.jobOpening.findMany({
      where: { companyId: caller.companyId },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { jobRole: { select: { name: true } } },
    });
    return NextResponse.json({
      data: openings.map((o) => ({ id: o.id, title: o.title, jobRole: o.jobRole.name, city: o.city, salaryRangeMin: o.salaryRangeMin, salaryRangeMax: o.salaryRangeMax, status: o.status, createdAt: o.createdAt.toISOString() })),
      count: openings.length,
    });
  });
}
