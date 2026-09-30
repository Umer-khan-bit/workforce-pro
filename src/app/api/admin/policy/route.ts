import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit, databaseErrorResponse, invalidInput } from "@/lib/adminApi";

const policySchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  version: z.string().trim().min(1, "Version is required").max(20),
  body: z.string().trim().min(20, "The policy text is too short").max(50_000),
});

/** Publishing creates a new version and makes it current. Older versions are kept so each consent still points at what was accepted. */
export async function POST(request: Request) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const parsed = policySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const policy = await prisma.$transaction(async (tx) => {
      await tx.policyDocument.updateMany({ where: { kind: "PRIVACY" }, data: { isCurrent: false } });
      return tx.policyDocument.create({
        data: { kind: "PRIVACY", ...parsed.data, isCurrent: true, createdById: guard.userId },
        select: { id: true },
      });
    });
    await audit(guard.userId, "PRIVACY_POLICY_PUBLISHED", "PolicyDocument", policy.id, {
      version: parsed.data.version,
    });
    return NextResponse.json({ id: policy.id }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "That version number is already used" }, { status: 409 });
    }
    const mapped = databaseErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}
