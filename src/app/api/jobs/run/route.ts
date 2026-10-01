import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isRateLimited } from "@/lib/rateLimit";
import { isJobName, runDueJobs, runJob } from "@/lib/jobs/runner";

const bodySchema = z.object({ job: z.string().max(40).optional() });

function secretMatches(header: string | null, secret: string): boolean {
  const given = /^Bearer\s+(\S+)$/i.exec(header ?? "")?.[1];
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * For an outside scheduler (cron, a hosting provider's scheduled call): runs the scheduled jobs that are due, or
 * one named job. Protected by the CRON_SECRET in the environment: without it set, the endpoint is switched off.
 * Wrong guesses are rate limited.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!secretMatches(request.headers.get("authorization"), secret)) {
    if (await isRateLimited("cron-secret:bad", 10, 15 * 60_000)) return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  if (parsed.data.job) {
    if (!isJobName(parsed.data.job)) return NextResponse.json({ error: "Unknown job" }, { status: 400 });
    const run = await runJob(prisma, parsed.data.job, "cron");
    return NextResponse.json({ ran: [{ job: run.job, status: run.status }] });
  }
  const runs = await runDueJobs(prisma);
  return NextResponse.json({ ran: runs.map((r) => ({ job: r.job, status: r.status })) });
}
