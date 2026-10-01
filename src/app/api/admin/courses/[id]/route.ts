import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit, databaseErrorResponse, invalidInput } from "@/lib/adminApi";
import { courseInputSchema } from "@/lib/training/schema";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  const parsed = courseInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    const before = await prisma.course.findUnique({ where: { id }, select: { price: true, isFree: true, isActive: true } });
    if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const course = await prisma.course.update({
      where: { id },
      // Clearing an optional field must write null, not leave the old value.
      data: { ...parsed.data, description: parsed.data.description ?? null, jobRoleId: parsed.data.jobRoleId ?? null, testType: parsed.data.testType ?? null },
    });
    await audit(guard.userId, "COURSE_UPDATED", "Course", id, { priceChangedFrom: before.price !== course.price ? before.price : undefined, wasActive: before.isActive, isActive: course.isActive });
    return NextResponse.json({ course });
  } catch (err) {
    const handled = databaseErrorResponse(err);
    if (handled) return handled;
    throw err;
  }
}

/** A course nobody has joined or paid for can be deleted; otherwise it should be deactivated so history stays intact. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  const [enrolments, payments] = await Promise.all([prisma.enrollment.count({ where: { courseId: id } }), prisma.payment.count({ where: { courseId: id } })]);
  if (enrolments > 0 || payments > 0) {
    return NextResponse.json({ error: "Candidates have joined or paid for this course, so it cannot be deleted. Switch it off (inactive) instead.", code: "IN_USE" }, { status: 409 });
  }
  try {
    await prisma.$transaction([prisma.courseRecommendation.deleteMany({ where: { courseId: id } }), prisma.courseLesson.deleteMany({ where: { courseId: id } }), prisma.course.delete({ where: { id } })]);
    await audit(guard.userId, "COURSE_DELETED", "Course", id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const handled = databaseErrorResponse(err);
    if (handled) return handled;
    throw err;
  }
}
