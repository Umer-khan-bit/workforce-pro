import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { markAllRead } from "@/lib/notifications";

/** Marks all of the signed-in user's notifications as read. */
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const updated = await markAllRead(prisma, session.user.id);
  return NextResponse.json({ ok: true, updated });
}
