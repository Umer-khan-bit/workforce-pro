import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit, invalidInput } from "@/lib/adminApi";
import { SETTING_SCHEMAS, isSettingKey, type SettingKey } from "@/lib/settings/definitions";
import { saveSetting } from "@/lib/settings";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const { key } = await params;
  if (!isSettingKey(key)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = SETTING_SCHEMAS[key].safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  if (key === "accounts") {
    const code = (parsed.data as { defaultPlanCode: string }).defaultPlanCode;
    if (code) {
      const plan = await prisma.plan.findUnique({ where: { code } });
      if (!plan?.isActive) {
        return NextResponse.json(
          { error: "Invalid input", issues: { formErrors: [], fieldErrors: { defaultPlanCode: ["Choose an active plan"] } } },
          { status: 400 }
        );
      }
    }
  }

  await saveSetting(key as SettingKey, parsed.data as never, guard.userId);
  // The audit log records which group changed, never the values (a logo is large, and some values are commercial).
  await audit(guard.userId, "SETTING_UPDATED", "SiteSetting", key);

  return NextResponse.json({ ok: true });
}
