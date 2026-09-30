import { NextResponse } from "next/server";
import { auth } from "@/auth";

/** Role check for PLATFORM_ADMIN API routes. Returns the admin's id, or a ready-made 403. */
export async function requirePlatformAdmin(): Promise<{ userId: string } | NextResponse> {
  const session = await auth();
  if (!session?.user || session.user.role !== "PLATFORM_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { userId: session.user.id };
}
