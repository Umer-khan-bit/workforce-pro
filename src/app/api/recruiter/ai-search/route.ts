import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hiringErrorResponse, requireStaff } from "@/lib/recruiter/guards";
import { getEntitlements, planBlockMessage } from "@/lib/recruiter/entitlements";
import { parseSearchRequest } from "@/lib/recruiter/aiSearch";
import { isRateLimited } from "@/lib/rateLimit";
import { aiErrorResponse } from "@/lib/ai/limits";
import { AiError, toAiError } from "@/lib/ai/errors";

const bodySchema = z.object({ query: z.string().trim().min(3, "Describe who you are looking for").max(500) });

// Security rule (stays in code): each recruiter may use AI search this often.
const LIMIT = 20;
const WINDOW_MS = 15 * 60 * 1000;

/** Turns a plain-language request into search filters (the plan must include AI search). The page then runs the normal search. */
export async function POST(request: Request) {
  const staff = await requireStaff(["RECRUITER"]);
  if (staff instanceof NextResponse) return staff;
  const ent = await getEntitlements(staff.companyId);
  if (!ent.canUseAiSearch) return NextResponse.json({ error: planBlockMessage(ent, "AI search"), code: "PLAN_FEATURE_REQUIRED" }, { status: 403 });
  if (await isRateLimited(`ai-search:${staff.userId}`, LIMIT, WINDOW_MS)) return NextResponse.json({ error: "Too many AI searches. Please wait a few minutes.", code: "RATE_LIMITED" }, { status: 429 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  try {
    return NextResponse.json(await parseSearchRequest({ prisma }, staff.userId, parsed.data.query));
  } catch (err) {
    if (err instanceof AiError || err instanceof Error) {
      const aiError = toAiError(err);
      // Setup problems are for the platform admin; recruiters just see that it is unavailable.
      if (["NO_API_KEY", "BAD_API_KEY", "NO_CREDIT", "BAD_MODEL", "BAD_REQUEST"].includes(aiError.code)) {
        return NextResponse.json({ error: "AI search is not available right now. Use the filters instead.", code: "UNAVAILABLE" }, { status: 503 });
      }
      return aiErrorResponse(aiError);
    }
    return hiringErrorResponse(err);
  }
}
