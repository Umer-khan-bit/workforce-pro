import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit, databaseErrorResponse, invalidInput } from "@/lib/adminApi";
import {
  AUDIT_NAMES,
  REFERENCE_SCHEMAS,
  RuleError,
  deleteReference,
  isReferenceEntity,
  updateReference,
} from "@/lib/reference/entities";

type Ctx = { params: Promise<{ entity: string; id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const { entity, id } = await params;
  if (!isReferenceEntity(entity)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = REFERENCE_SCHEMAS[entity].safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    await updateReference(prisma, entity, id, parsed.data as Record<string, unknown>);
    await audit(guard.userId, `${AUDIT_NAMES[entity].toUpperCase()}_UPDATED`, AUDIT_NAMES[entity], id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof RuleError) return NextResponse.json({ error: err.message }, { status: 400 });
    const mapped = databaseErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const { entity, id } = await params;
  if (!isReferenceEntity(entity)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await deleteReference(prisma, entity, id);
    await audit(guard.userId, `${AUDIT_NAMES[entity].toUpperCase()}_DELETED`, AUDIT_NAMES[entity], id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof RuleError) return NextResponse.json({ error: err.message }, { status: 400 });
    const mapped = databaseErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}
