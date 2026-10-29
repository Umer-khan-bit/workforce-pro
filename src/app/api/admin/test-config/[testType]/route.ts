import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit, invalidInput } from "@/lib/adminApi";
import { testConfigSchema } from "@/lib/testConfig";
import { getSetting } from "@/lib/settings";
import { limitTooLong, questionSecondsFor } from "@/lib/testEngine/questionLimit";
import { TEST_TYPES, type TestTypeValue } from "@/lib/questionBank/schema";

export async function PATCH(request: Request, { params }: { params: Promise<{ testType: string }> }) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const { testType } = await params;
  if (!(TEST_TYPES as readonly string[]).includes(testType)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = testConfigSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);

  // The whole test may not be shorter than the time allowed for one question.
  const tooShort = limitTooLong(testType as TestTypeValue, questionSecondsFor(await getSetting("testing"), testType as TestTypeValue), parsed.data.timeLimitMinutes);
  if (tooShort) {
    return NextResponse.json({ error: "Invalid input", issues: { formErrors: [], fieldErrors: { timeLimitMinutes: [`${tooShort} Lower the time per question in Settings > Tests first.`] } } }, { status: 400 });
  }

  await prisma.testConfig.upsert({
    where: { testType: testType as TestTypeValue },
    create: { testType: testType as TestTypeValue, ...parsed.data },
    update: parsed.data,
  });
  await audit(guard.userId, "TEST_CONFIG_UPDATED", "TestConfig", testType, parsed.data);
  return NextResponse.json({ ok: true });
}
