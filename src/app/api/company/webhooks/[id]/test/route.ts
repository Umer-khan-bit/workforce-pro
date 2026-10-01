import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { overLimit, tooManyRequests } from "@/lib/authLimits";
import { requireStaff } from "@/lib/recruiter/guards";
import { AtsError } from "@/lib/ats/apiKeys";
import { sendTestEvent } from "@/lib/ats/webhooks";

/** Sends a test event to the webhook so the company can check its receiver. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(["COMPANY_ADMIN"]);
  if (staff instanceof NextResponse) return staff;
  if (await overLimit(`webhook-test:${staff.userId}`, 30)) return tooManyRequests();
  const { id } = await params;
  try {
    const delivery = await sendTestEvent(prisma, { userId: staff.userId, endpointId: id });
    return NextResponse.json({ status: delivery?.status ?? "FAILED", responseStatus: delivery?.responseStatus ?? null, error: delivery?.error ?? null });
  } catch (err) {
    if (err instanceof AtsError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }
}
