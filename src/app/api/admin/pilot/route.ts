import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit, invalidInput } from "@/lib/adminApi";

const pilotSchema = z
  .object({ enabled: z.boolean(), companyId: z.string().min(1).nullable() })
  .refine((p) => !p.enabled || p.companyId, {
    message: "Choose the company that is allowed in during the pilot",
    path: ["companyId"],
  });

export async function PUT(request: Request) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const parsed = pilotSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);

  if (parsed.data.companyId) {
    const company = await prisma.company.findUnique({ where: { id: parsed.data.companyId } });
    if (!company) return NextResponse.json({ error: "That company does not exist" }, { status: 400 });
  }

  // Pilot mode is a single platform-wide switch, so there is only ever one row.
  const existing = await prisma.pilotConfig.findFirst();
  if (existing) {
    await prisma.pilotConfig.update({ where: { id: existing.id }, data: parsed.data });
  } else {
    await prisma.pilotConfig.create({ data: parsed.data });
  }
  await audit(guard.userId, "PILOT_MODE_UPDATED", "PilotConfig", existing?.id ?? null, {
    enabled: parsed.data.enabled,
    companyId: parsed.data.companyId,
  });
  return NextResponse.json({ ok: true });
}
