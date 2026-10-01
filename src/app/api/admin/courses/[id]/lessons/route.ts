import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit, invalidInput } from "@/lib/adminApi";
import { lessonInputSchema } from "@/lib/training/schema";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  const parsed = lessonInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);

  const course = await prisma.course.findUnique({ where: { id }, select: { id: true } });
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // New lessons go at the end.
  const last = await prisma.courseLesson.findFirst({ where: { courseId: id }, orderBy: { order: "desc" }, select: { order: true } });
  const lesson = await prisma.courseLesson.create({
    data: { courseId: id, title: parsed.data.title, content: parsed.data.content ?? null, durationMinutes: parsed.data.durationMinutes ?? null, order: (last?.order ?? 0) + 1 },
  });
  await audit(guard.userId, "LESSON_CREATED", "CourseLesson", lesson.id, { courseId: id });
  return NextResponse.json({ lesson }, { status: 201 });
}
