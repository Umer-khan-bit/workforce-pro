import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit } from "@/lib/adminApi";
import { isJobName, runJob } from "@/lib/jobs/runner";

/** The platform admin runs a scheduled job by hand (for example the Recalibrate now button). */
export async function POST(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;
  const { name } = await params;
  if (!isJobName(name)) return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  const run = await runJob(prisma, name, "manual", { actorId: guard.userId });
  await audit(guard.userId, "JOB_RUN_MANUALLY", "JobRun", run.id, { job: name, status: run.status });
  return NextResponse.json({ status: run.status, summary: run.summary, error: run.error });
}
