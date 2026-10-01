import { NextResponse } from "next/server";

/**
 * A receiver for trying out webhooks in demo mode: it accepts anything and answers 200. It is the one address
 * on this site that webhooks may point at, and only in demo mode; on a live site it does not exist.
 */
export async function POST() {
  if (process.env.DEMO_MODE !== "true") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
