import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrency } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { TEST_SLUGS, TEST_TITLES } from "@/lib/testEngine/labels";
import { EnrolButton, LessonList } from "./CourseActions";

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const profile = await prisma.candidateProfile.findFirst({ where: { userId: session!.user.id, anonymisedAt: null }, select: { id: true, jobRoleId: true } });
  if (!profile) redirect("/login");

  const course = await prisma.course.findFirst({
    where: { id, isActive: true, OR: [{ jobRoleId: null }, ...(profile.jobRoleId ? [{ jobRoleId: profile.jobRoleId }] : [])] },
    include: { lessons: { orderBy: { order: "asc" } }, jobRole: { select: { name: true } } },
  });
  if (!course) notFound();

  const [currency, enrollment] = await Promise.all([
    getCurrency(),
    prisma.enrollment.findUnique({ where: { candidateProfileId_courseId: { candidateProfileId: profile.id, courseId: course.id } }, include: { lessonProgress: true } }),
  ]);
  const done = new Set((enrollment?.lessonProgress ?? []).filter((p) => p.completedAt).map((p) => p.lessonId));
  const price = course.isFree ? "Free" : formatMoney(course.price, currency);

  return (
    <div className="max-w-2xl">
      <Link href="/candidate/training" className="text-sm text-brand-700 underline">&larr; Training</Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900">{course.title}</h1>
      <p className="mt-1 text-sm text-zinc-600">
        {price} · {course.lessons.length} lessons{course.testType ? ` · helps with your ${TEST_TITLES[course.testType]} test` : ""}{course.jobRole ? ` · for ${course.jobRole.name}` : ""}
      </p>
      {course.description && <p className="mt-3 text-zinc-800">{course.description}</p>}

      {enrollment ? (
        <section className="mt-6" aria-labelledby="lessons-h">
          <div className="flex items-center justify-between gap-3">
            <h2 id="lessons-h" className="text-lg font-semibold text-zinc-900">Lessons</h2>
            <span className="text-sm text-zinc-600" data-testid="progress-text">{enrollment.status === "COMPLETED" ? "Completed" : `${enrollment.progressPercent}% done`}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={enrollment.progressPercent} aria-label="Course progress">
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${enrollment.progressPercent}%` }} />
          </div>
          {enrollment.status === "COMPLETED" && (
            <p className="mt-3 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900" data-testid="completed-note">
              You completed this course.{" "}
              {course.testType ? <Link href={`/candidate/tests/${TEST_SLUGS[course.testType]}`} className="underline">Retake your {TEST_TITLES[course.testType]} test</Link> : <Link href="/candidate/tests" className="underline">Go to My tests</Link>}
            </p>
          )}
          <div className="mt-4">
            <LessonList lessons={course.lessons.map((l) => ({ id: l.id, title: l.title, content: l.content, durationMinutes: l.durationMinutes, done: done.has(l.id) }))} />
          </div>
        </section>
      ) : (
        <>
          <section className="card mt-6" aria-labelledby="join-h">
            <h2 id="join-h" className="font-semibold text-zinc-900">{course.isFree ? "Join for free" : `Buy this course for ${price}`}</h2>
            <p className="mt-1 text-sm text-zinc-700">{course.isFree ? "You can start straight away and finish at your own pace." : "Pay once and keep access. You will see the lessons right after payment."}</p>
            <div className="mt-4">
              {course.isFree ? <EnrolButton courseId={course.id} /> : <Link href={`/candidate/training/${course.id}/checkout`} className="btn-primary" data-testid="buy">Buy for {price}</Link>}
            </div>
          </section>
          <section className="mt-6" aria-labelledby="outline-h">
            <h2 id="outline-h" className="text-lg font-semibold text-zinc-900">What you will learn</h2>
            <ol className="card mt-2 list-decimal space-y-1 pl-9 text-sm text-zinc-800">
              {course.lessons.map((l) => <li key={l.id}>{l.title}{l.durationMinutes ? ` (${l.durationMinutes} min)` : ""}</li>)}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
