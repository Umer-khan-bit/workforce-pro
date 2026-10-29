import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit, invalidInput } from "@/lib/adminApi";
import { SETTING_SCHEMAS, isSettingKey, type SettingKey } from "@/lib/settings/definitions";
import { saveSetting } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { QUESTION_SECONDS_FIELD, type SettingValue } from "@/lib/settings/definitions";
import { limitTooLong, questionSecondsFor } from "@/lib/testEngine/questionLimit";
import type { TestType } from "@prisma/client";

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

  if (key === "testing") {
    // A time per question longer than the whole test makes no sense: refuse it and say which test.
    const testing = parsed.data as SettingValue<"testing">;
    const configs = await prisma.testConfig.findMany();
    for (const c of configs) {
      const problem = limitTooLong(c.testType, questionSecondsFor(testing, c.testType), c.timeLimitMinutes);
      if (problem) {
        const field = QUESTION_SECONDS_FIELD[c.testType as TestType];
        return NextResponse.json({ error: "Invalid input", issues: { formErrors: [], fieldErrors: { [field]: [problem] } } }, { status: 400 });
      }
    }
  }

  await saveSetting(key as SettingKey, parsed.data as never, guard.userId);
  // The audit log records which group changed, never the values (a logo is large, and some values are commercial).
  await audit(guard.userId, "SETTING_UPDATED", "SiteSetting", key);

  return NextResponse.json({ ok: true });
}
