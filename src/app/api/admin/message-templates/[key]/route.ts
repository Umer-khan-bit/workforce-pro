import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit, invalidInput } from "@/lib/adminApi";
import { unknownPlaceholders } from "@/lib/messageTemplates";

const templateSchema = z.object({
  subject: z.string().trim().min(1, "Subject is required").max(200),
  body: z.string().trim().min(1, "Message is required").max(10_000),
  isActive: z.boolean(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const { key } = await params;
  const template = await prisma.messageTemplate.findUnique({ where: { key } });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = templateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);

  const allowed = template.variables as string[];
  const unknown = [
    ...unknownPlaceholders(parsed.data.subject, allowed),
    ...unknownPlaceholders(parsed.data.body, allowed),
  ];
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `Unknown placeholder: ${[...new Set(unknown)].map((v) => `{{${v}}}`).join(", ")}. Available: ${allowed.map((v) => `{{${v}}}`).join(", ")}` },
      { status: 400 }
    );
  }

  await prisma.messageTemplate.update({ where: { key }, data: parsed.data });
  await audit(guard.userId, "MESSAGE_TEMPLATE_UPDATED", "MessageTemplate", key);
  return NextResponse.json({ ok: true });
}
