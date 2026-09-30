import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { importIpipItems } from "@/lib/questionBank/ipipImport";

export async function POST() {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  try {
    const result = await importIpipItems(prisma, guard.userId);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Import failed. Has the seed been run?" }, { status: 500 });
  }
}
