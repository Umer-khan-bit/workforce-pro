import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit, invalidInput } from "@/lib/adminApi";
import { lessonPatchSchema } from "@/lib/training/schema";

/** Edits a lesson, or moves it up or down in its course (swapping places with its neighbour). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  const parsed = lessonPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);
  const lesson = await prisma.courseLesson.findUnique({ where: { id } });
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { direction, ...fields } = parsed.data;
  if (direction) {
    const neighbour = await prisma.courseLesson.findFirst({
      where: { courseId: lesson.courseId, order: direction === "up" ? { lt: lesson.order } : { gt: lesson.order } },
      orderBy: { order: direction === "up" ? "desc" : "asc" },
    });
    if (neighbour) {
      await prisma.$transaction([
        prisma.courseLesson.update({ where: { id: lesson.id }, data: { order: neighbour.order } }),
        prisma.courseLesson.update({ where: { id: neighbour.id }, data: { order: lesson.order } }),
      ]);
    }
    return NextResponse.json({ ok: true });
  }

  const updated = await prisma.courseLesson.update({
    where: { id },
    data: {
      ...(fields.title !== undefined ? { title: fields.title } : {}),
      ...(fields.content !== undefined ? { content: fields.content } : {}),
      ...(fields.durationMinutes !== undefined ? { durationMinutes: fields.durationMinutes } : {}),
    },
  });
  await audit(guard.userId, "LESSON_UPDATED", "CourseLesson", id, { courseId: lesson.courseId });
  return NextResponse.json({ lesson: updated });
}

/** A lesson nobody has started can be deleted; once learners have progress on it, edit it instead. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  const lesson = await prisma.courseLesson.findUnique({ where: { id } });
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((await prisma.lessonProgress.count({ where: { lessonId: id } })) > 0) {
    return NextResponse.json({ error: "Candidates have already started this lesson, so it cannot be deleted. Edit it instead.", code: "IN_USE" }, { status: 409 });
  }
  await prisma.courseLesson.delete({ where: { id } });
  await audit(guard.userId, "LESSON_DELETED", "CourseLesson", id, { courseId: lesson.courseId });
  return NextResponse.json({ ok: true });
}
