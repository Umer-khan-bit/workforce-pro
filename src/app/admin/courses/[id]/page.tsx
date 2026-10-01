import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrency } from "@/lib/settings";
import CourseForm from "../CourseForm";
import LessonsEditor from "./LessonsEditor";
import DeleteCourse from "./DeleteCourse";

export default async function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [course, roles, currency] = await Promise.all([
    prisma.course.findUnique({
      where: { id },
      include: { lessons: { orderBy: { order: "asc" }, include: { _count: { select: { lessonProgress: true } } } }, _count: { select: { enrollments: true } } },
    }),
    prisma.jobRole.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    getCurrency(),
  ]);
  if (!course) notFound();

  return (
    <div className="max-w-3xl">
      <Link href="/admin/courses" className="text-sm text-brand-700 underline">&larr; Courses</Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900">{course.title}</h1>
      <p className="mt-1 text-zinc-600">{course._count.enrollments} candidate{course._count.enrollments === 1 ? "" : "s"} joined.</p>

      <div className="mt-5">
        <CourseForm
          roles={roles}
          courseId={course.id}
          currencyCode={currency.code}
          initial={{ title: course.title, description: course.description ?? "", isFree: course.isFree, price: course.price ? String(course.price) : "", jobRoleId: course.jobRoleId ?? "", testType: course.testType ?? "", isActive: course.isActive }}
        />
      </div>

      <div className="mt-8">
        <LessonsEditor courseId={course.id} lessons={course.lessons.map((l) => ({ id: l.id, title: l.title, content: l.content ?? "", durationMinutes: l.durationMinutes ? String(l.durationMinutes) : "", learners: l._count.lessonProgress }))} />
      </div>

      <div className="mt-8">
        <DeleteCourse courseId={course.id} inUse={course._count.enrollments > 0} />
      </div>
    </div>
  );
}
