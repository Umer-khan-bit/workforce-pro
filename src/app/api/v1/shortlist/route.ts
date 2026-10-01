import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { loadAtsCandidates } from "@/lib/ats/payload";
import { withApiKey } from "@/lib/ats/v1";

const querySchema = z.object({
  status: z.enum(["SHORTLISTED", "CONTACTED", "INTERVIEWING", "OFFERED", "HIRED", "REJECTED"]).optional(),
  opening: z.string().min(1).max(60).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/** The company's shortlisted candidates, for the company's ATS. Authorization: Bearer <API key>. */
export async function GET(request: Request) {
  return withApiKey(request, async (caller) => {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return NextResponse.json({ error: "Invalid query", code: "INVALID_INPUT", issues: parsed.error.flatten() }, { status: 400 });
    const data = await loadAtsCandidates(prisma, { companyId: caller.companyId, status: parsed.data.status, openingId: parsed.data.opening, limit: parsed.data.limit });
    return NextResponse.json({ data, count: data.length });
  });
}
