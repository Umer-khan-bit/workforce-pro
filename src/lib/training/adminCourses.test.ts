import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as null | { id: string; role: string } }));
vi.mock("@/auth", () => ({ auth: async () => (session.user ? { user: session.user } : null) }));

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { courseInputSchema, lessonInputSchema } from "./schema";
import { POST as createCourse } from "@/app/api/admin/courses/route";
import { PATCH as updateCourse, DELETE as deleteCourse } from "@/app/api/admin/courses/[id]/route";
import { POST as addLesson } from "@/app/api/admin/courses/[id]/lessons/route";
import { PATCH as patchLesson, DELETE as deleteLesson } from "@/app/api/admin/lessons/[id]/route";

describe("course input rules", () => {
  it("a paid course needs a price; a free course is stored with price 0", () => {
    expect(courseInputSchema.safeParse({ title: "Course", isFree: false, price: 0 }).success).toBe(false);
    expect(courseInputSchema.parse({ title: "Course", isFree: false, price: "2500" }).price).toBe(2500);
    expect(courseInputSchema.parse({ title: "Course", isFree: true, price: 999 }).price).toBe(0);
  });
  it("treats empty optional fields as not set and rejects an unknown test", () => {
    const c = courseInputSchema.parse({ title: "Course", isFree: true, description: "", jobRoleId: "", testType: "" });
    expect(c).toMatchObject({ description: undefined, jobRoleId: undefined, testType: undefined, isActive: true });
    expect(courseInputSchema.safeParse({ title: "Course", isFree: true, testType: "NOPE" }).success).toBe(false);
  });
  it("lessons need a title and a sensible length", () => {
    expect(lessonInputSchema.safeParse({ title: "x" }).success).toBe(false);
    expect(lessonInputSchema.safeParse({ title: "Lesson", durationMinutes: 0 }).success).toBe(false);
    expect(lessonInputSchema.parse({ title: "Lesson", durationMinutes: "15", content: "" })).toMatchObject({ durationMinutes: 15, content: undefined });
  });
});

const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
const post = (body: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe.skipIf(!dbUp)("admin course management (real database)", () => {
  let adminId: string;
  let learnerId: string;
  let learnerProfileId: string;
  const tag = `adm${Date.now().toString(36)}`;
  const courseIds: string[] = [];

  beforeAll(async () => {
    adminId = (await prisma.user.create({ data: { email: `${tag}-admin@example.test`, name: "Admin", password: await hashPassword("x-admin-pass-1"), role: "PLATFORM_ADMIN", emailVerified: new Date() } })).id;
    const learner = await prisma.user.create({ data: { email: `${tag}-learner@example.test`, name: "Learner", password: await hashPassword("x-learner-pass-1"), role: "CANDIDATE", emailVerified: new Date(), candidateProfile: { create: { consentGiven: true } } }, include: { candidateProfile: true } });
    learnerId = learner.id;
    learnerProfileId = learner.candidateProfile!.id;
    session.user = { id: adminId, role: "PLATFORM_ADMIN" };
  }, 30_000);

  afterAll(async () => {
    await prisma.lessonProgress.deleteMany({ where: { lesson: { courseId: { in: courseIds } } } });
    await prisma.enrollment.deleteMany({ where: { courseId: { in: courseIds } } });
    await prisma.courseLesson.deleteMany({ where: { courseId: { in: courseIds } } });
    await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, learnerId] } } });
  }, 30_000);

  const make = async (body: Record<string, unknown> = {}) => {
    const res = await createCourse(post({ title: `Course ${tag}`, isFree: true, ...body }));
    const course = (await res.json()).course;
    if (course) courseIds.push(course.id);
    return { res, course };
  };

  it("only a platform admin can manage courses", async () => {
    for (const user of [null, { id: learnerId, role: "CANDIDATE" }, { id: "r", role: "RECRUITER" }, { id: "c", role: "COMPANY_ADMIN" }]) {
      session.user = user;
      expect((await createCourse(post({ title: "No way", isFree: true }))).status).toBe(403);
      expect((await updateCourse(post({ title: "No way", isFree: true }), ctx("x"))).status).toBe(403);
      expect((await deleteCourse(post({}), ctx("x"))).status).toBe(403);
      expect((await addLesson(post({ title: "No way" }), ctx("x"))).status).toBe(403);
      expect((await patchLesson(post({ title: "No way" }), ctx("x"))).status).toBe(403);
      expect((await deleteLesson(post({}), ctx("x"))).status).toBe(403);
    }
    session.user = { id: adminId, role: "PLATFORM_ADMIN" };
  });

  it("creates a course and writes an audit entry; validates the input", async () => {
    const { res, course } = await make({ description: "About it", testType: "IQ" });
    expect(res.status).toBe(201);
    expect(course).toMatchObject({ isFree: true, price: 0, testType: "IQ", isActive: true });
    expect(await prisma.auditLog.count({ where: { actorId: adminId, action: "COURSE_CREATED", targetId: course.id } })).toBe(1);
    expect((await createCourse(post({ title: "x", isFree: true }))).status).toBe(400);
    expect((await createCourse(post({ title: "Paid without price", isFree: false }))).status).toBe(400);
  });

  it("edits a course, clears optional fields when they are emptied, and logs a price change", async () => {
    const { course } = await make({ isFree: false, price: 3000, description: "Old", testType: "EQ" });
    const res = await updateCourse(post({ title: "Renamed", isFree: false, price: 3500, description: "", testType: "", jobRoleId: "" }), ctx(course.id));
    expect(res.status).toBe(200);
    const after = await prisma.course.findUniqueOrThrow({ where: { id: course.id } });
    expect(after).toMatchObject({ title: "Renamed", price: 3500, description: null, testType: null, jobRoleId: null });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { actorId: adminId, action: "COURSE_UPDATED", targetId: course.id } });
    expect(log.metadata).toMatchObject({ priceChangedFrom: 3000 });
    expect((await updateCourse(post({ title: "Ghost", isFree: true }), ctx("missing"))).status).toBe(404);
  });

  it("adds lessons at the end, moves them up and down, edits and deletes them", async () => {
    const { course } = await make();
    const ids: string[] = [];
    for (const title of ["First lesson", "Second lesson", "Third lesson"]) {
      const res = await addLesson(post({ title, content: `${title} text`, durationMinutes: 10 }), ctx(course.id));
      expect(res.status).toBe(201);
      ids.push((await res.json()).lesson.id);
    }
    const order = async () => (await prisma.courseLesson.findMany({ where: { courseId: course.id }, orderBy: { order: "asc" } })).map((l) => l.title);
    expect(await order()).toEqual(["First lesson", "Second lesson", "Third lesson"]);

    await patchLesson(post({ direction: "up" }), ctx(ids[2]));
    expect(await order()).toEqual(["First lesson", "Third lesson", "Second lesson"]);
    await patchLesson(post({ direction: "down" }), ctx(ids[0]));
    expect(await order()).toEqual(["Third lesson", "First lesson", "Second lesson"]);
    await patchLesson(post({ direction: "up" }), ctx(ids[2])); // already first: nothing happens
    expect(await order()).toEqual(["Third lesson", "First lesson", "Second lesson"]);

    await patchLesson(post({ title: "Third lesson (edited)", content: "New text" }), ctx(ids[2]));
    expect(await prisma.courseLesson.findUniqueOrThrow({ where: { id: ids[2] } })).toMatchObject({ title: "Third lesson (edited)", content: "New text", durationMinutes: 10 });
    expect((await deleteLesson(post({}), ctx(ids[1]))).status).toBe(200);
    expect(await order()).toEqual(["Third lesson (edited)", "First lesson"]);
    expect((await addLesson(post({ title: "No course" }), ctx("missing"))).status).toBe(404);
  });

  it("will not delete a lesson learners have started, or a course they have joined; deactivating still works", async () => {
    const { course } = await make();
    const lesson = (await (await addLesson(post({ title: "Started lesson" }), ctx(course.id))).json()).lesson;
    const enrollment = await prisma.enrollment.create({ data: { candidateProfileId: learnerProfileId, courseId: course.id } });
    await prisma.lessonProgress.create({ data: { enrollmentId: enrollment.id, lessonId: lesson.id, completedAt: new Date() } });

    const lessonRes = await deleteLesson(post({}), ctx(lesson.id));
    expect(lessonRes.status).toBe(409);
    expect((await lessonRes.json()).code).toBe("IN_USE");
    const courseRes = await deleteCourse(post({}), ctx(course.id));
    expect(courseRes.status).toBe(409);
    expect(await prisma.course.count({ where: { id: course.id } })).toBe(1);

    expect((await updateCourse(post({ title: `Course ${tag}`, isFree: true, isActive: false }), ctx(course.id))).status).toBe(200);
    expect((await prisma.course.findUniqueOrThrow({ where: { id: course.id } })).isActive).toBe(false);
  });

  it("deletes an unused course together with its lessons", async () => {
    const { course } = await make();
    await addLesson(post({ title: "Soon gone" }), ctx(course.id));
    expect((await deleteCourse(post({}), ctx(course.id))).status).toBe(200);
    expect(await prisma.course.count({ where: { id: course.id } })).toBe(0);
    expect(await prisma.courseLesson.count({ where: { courseId: course.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { actorId: adminId, action: "COURSE_DELETED", targetId: course.id } })).toBe(1);
  });
});
