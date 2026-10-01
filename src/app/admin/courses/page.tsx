import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrency } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { TEST_TYPE_LABELS } from "@/lib/questionBank/schema";
import CourseForm from "./CourseForm";

export default async function CoursesPage() {
  const [courses, roles, currency] = await Promise.all([
    prisma.course.findMany({
      orderBy: [{ isActive: "desc" }, { title: "asc" }],
      include: { jobRole: { select: { name: true } }, _count: { select: { lessons: true, enrollments: true } } },
    }),
    prisma.jobRole.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    getCurrency(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Courses</h1>
      <p className="mt-1 text-zinc-600">The training catalogue candidates see under Training. Courses can be free or paid, general or for one job role.</p>

      <div className="mt-5 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[40rem] text-left text-sm" data-testid="courses-table">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Course</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Helps with</th>
              <th className="px-4 py-3">Lessons</th>
              <th className="px-4 py-3">Learners</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {courses.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-zinc-600">No courses yet. Add the first one below.</td></tr>
            )}
            {courses.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3"><Link href={`/admin/courses/${c.id}`} className="font-medium text-brand-700 underline">{c.title}</Link></td>
                <td className="px-4 py-3">{c.isFree ? "Free" : formatMoney(c.price, currency)}</td>
                <td className="px-4 py-3">{c.jobRole?.name ?? "General"}</td>
                <td className="px-4 py-3">{c.testType ? TEST_TYPE_LABELS[c.testType] : "-"}</td>
                <td className="px-4 py-3">{c._count.lessons}</td>
                <td className="px-4 py-3">{c._count.enrollments}</td>
                <td className="px-4 py-3">{c.isActive ? <span className="badge bg-green-50 text-green-800">Active</span> : <span className="badge bg-zinc-100 text-zinc-700">Inactive</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-zinc-900">Add a course</h2>
      <div className="mt-3 max-w-3xl">
        <CourseForm roles={roles} currencyCode={currency.code} />
      </div>
    </div>
  );
}
