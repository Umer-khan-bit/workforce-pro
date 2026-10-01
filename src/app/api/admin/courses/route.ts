import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit, databaseErrorResponse, invalidInput } from "@/lib/adminApi";
import { courseInputSchema } from "@/lib/training/schema";

export async function POST(request: Request) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;
  const parsed = courseInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    const course = await prisma.course.create({ data: parsed.data });
    await audit(guard.userId, "COURSE_CREATED", "Course", course.id, { isFree: course.isFree });
    return NextResponse.json({ course }, { status: 201 });
  } catch (err) {
    const handled = databaseErrorResponse(err);
    if (handled) return handled;
    throw err;
  }
}
