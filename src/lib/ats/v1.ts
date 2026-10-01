import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AtsError, authenticateApiKey, type ApiCaller } from "./apiKeys";
import { HiringError } from "@/lib/recruiter/shortlist";

/**
 * Runs an API v1 handler for a caller who proved themselves with an API key. Errors become JSON
 * `{ error, code }` with the right status; nothing is cached.
 */
export async function withApiKey(request: Request, handler: (caller: ApiCaller) => Promise<NextResponse>): Promise<NextResponse> {
  try {
    const caller = await authenticateApiKey(prisma, request.headers.get("authorization"));
    const res = await handler(caller);
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    if (err instanceof AtsError || err instanceof HiringError) {
      const res = NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
      if (err.status === 429) res.headers.set("Retry-After", "60");
      res.headers.set("Cache-Control", "no-store");
      return res;
    }
    throw err;
  }
}
