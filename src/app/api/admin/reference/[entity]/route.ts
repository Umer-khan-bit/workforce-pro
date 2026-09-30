import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit, databaseErrorResponse, invalidInput } from "@/lib/adminApi";
import {
  AUDIT_NAMES,
  REFERENCE_SCHEMAS,
  RuleError,
  createReference,
  isReferenceEntity,
} from "@/lib/reference/entities";

export async function POST(request: Request, { params }: { params: Promise<{ entity: string }> }) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const { entity } = await params;
  if (!isReferenceEntity(entity)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = REFERENCE_SCHEMAS[entity].safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const row = (await createReference(prisma, entity, parsed.data as Record<string, unknown>)) as { id: string };
    await audit(guard.userId, `${AUDIT_NAMES[entity].toUpperCase()}_CREATED`, AUDIT_NAMES[entity], row.id);
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err) {
    if (err instanceof RuleError) return NextResponse.json({ error: err.message }, { status: 400 });
    const mapped = databaseErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}
