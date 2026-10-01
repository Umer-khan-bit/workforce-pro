import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hiringErrorResponse, requireStaff } from "@/lib/recruiter/guards";
import { requireVerifiedEmail } from "@/lib/emailVerification";
import { overLimit, tooManyRequests } from "@/lib/authLimits";
import { changePlan } from "@/lib/subscriptions";

const bodySchema = z.object({ planCode: z.string().min(1).max(60), simulate: z.enum(["success", "failure"]).default("success") });

/**
 * A company admin moves their company to a plan (new, upgrade, downgrade or renew) and pays through the payment
 * provider: the simulated gateway in demo mode. A failed payment answers 402 and leaves the plan alone.
 */
export async function POST(request: Request) {
  const staff = await requireStaff(["COMPANY_ADMIN"]);
  if (staff instanceof NextResponse) return staff;
  const blocked = await requireVerifiedEmail(staff.userId);
  if (blocked) return blocked;
  if (await overLimit(`checkout:${staff.userId}`, 30)) return tooManyRequests();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    const result = await changePlan(prisma, { userId: staff.userId, planCode: parsed.data.planCode, simulate: parsed.data.simulate });
    if (result.status === "FAILED") return NextResponse.json({ error: result.reason, code: "PAYMENT_FAILED", paymentId: result.paymentId }, { status: 402 });
    return NextResponse.json({ subscriptionId: result.subscriptionId, kind: result.quote.kind, amountDue: result.quote.amountDue }, { status: 201 });
  } catch (err) {
    return hiringErrorResponse(err);
  }
}
