import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit, invalidInput } from "@/lib/adminApi";
import { testConfigSchema } from "@/lib/testConfig";
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

  await prisma.testConfig.upsert({
    where: { testType: testType as TestTypeValue },
    create: { testType: testType as TestTypeValue, ...parsed.data },
    update: parsed.data,
  });
  await audit(guard.userId, "TEST_CONFIG_UPDATED", "TestConfig", testType, parsed.data);
  return NextResponse.json({ ok: true });
}
