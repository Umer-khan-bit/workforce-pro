import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { notifyUser } from "@/lib/notifications";
import { readSetting } from "@/lib/settings/store";
import { getPaymentProvider, PaymentsUnavailableError, type PaymentProvider } from "@/lib/payments/provider";

export class TrainingError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "TrainingError";
  }
}

type Db = PrismaClient;

/** Share of lessons finished, as a whole percent. A course with no lessons is 0. */
export function progressPercent(completedLessons: number, totalLessons: number): number {
  if (totalLessons <= 0) return 0;
  return Math.min(100, Math.round((completedLessons / totalLessons) * 100));
}

async function candidateOf(db: Pick<PrismaClient, "user">, userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, isActive: true, candidateProfile: { select: { id: true, anonymisedAt: true, jobRoleId: true } } },
  });
  const profile = user?.candidateProfile;
  if (!user?.isActive || user.role !== "CANDIDATE" || !profile || profile.anonymisedAt) throw new TrainingError(403, "FORBIDDEN", "Only candidates can join courses.");
  return { userId: user.id, name: user.name, profileId: profile.id, jobRoleId: profile.jobRoleId };
}

/** An active course the candidate may join: a general one, or one for their own job role. */
async function activeCourse(db: Pick<PrismaClient, "course">, courseId: string, jobRoleId: string | null) {
  const course = await db.course.findFirst({
    where: { id: courseId, isActive: true, OR: [{ jobRoleId: null }, ...(jobRoleId ? [{ jobRoleId }] : [])] },
    include: { _count: { select: { lessons: true } } },
  });
  if (!course) throw new TrainingError(404, "COURSE_NOT_FOUND", "Course not found.");
  return course;
}

async function createEnrollment(db: Db | Prisma.TransactionClient, profileId: string, courseId: string) {
  try {
    return await db.enrollment.create({ data: { candidateProfileId: profileId, courseId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new TrainingError(409, "ALREADY_ENROLLED", "You are already enrolled in this course.");
    throw err;
  }
}

async function notifyEnrolled(db: Db, userId: string, name: string | null, courseTitle: string, courseId: string) {
  await notifyUser(db, { userId, templateKey: "COURSE_ENROLLED_IN_APP", type: "TRAINING_UPDATE", values: { candidateName: name ?? "there", courseTitle }, link: `/candidate/training/${courseId}` });
}

/** Enrols the candidate in a free course. Paid courses must go through `purchaseCourse`. */
export async function enrolInFreeCourse(db: Db, userId: string, courseId: string) {
  const candidate = await candidateOf(db, userId);
  const course = await activeCourse(db, courseId, candidate.jobRoleId);
  if (!course.isFree && course.price > 0) throw new TrainingError(402, "PAYMENT_REQUIRED", "This course has to be paid for first.");
  const enrollment = await createEnrollment(db, candidate.profileId, course.id);
  await db.auditLog.create({ data: { actorId: userId, action: "COURSE_ENROLLED", targetType: "Course", targetId: course.id, metadata: { paid: false } } });
  await notifyEnrolled(db, userId, candidate.name, course.title, course.id);
  return enrollment;
}

export type PurchaseResult = { status: "SUCCESS"; enrollmentId: string; paymentId: string } | { status: "FAILED"; paymentId: string; reason: string };

/**
 * Buys a paid course through the payment provider. A Payment row is written first (PENDING), then the
 * provider is asked to charge; success creates the enrolment and links the payment, failure leaves the
 * payment as FAILED and enrols nobody. Nothing is stored about card details: the gateway handles those.
 */
export async function purchaseCourse(
  db: Db,
  userId: string,
  courseId: string,
  options: { simulate?: "success" | "failure"; provider?: PaymentProvider } = {}
): Promise<PurchaseResult> {
  const candidate = await candidateOf(db, userId);
  const course = await activeCourse(db, courseId, candidate.jobRoleId);
  if (course.isFree || course.price <= 0) throw new TrainingError(400, "COURSE_IS_FREE", "This course is free: just enrol.");

  const already = await db.enrollment.findUnique({ where: { candidateProfileId_courseId: { candidateProfileId: candidate.profileId, courseId: course.id } } });
  if (already) throw new TrainingError(409, "ALREADY_ENROLLED", "You are already enrolled in this course.");

  let provider: PaymentProvider;
  try {
    provider = options.provider ?? getPaymentProvider();
  } catch (err) {
    if (err instanceof PaymentsUnavailableError) throw new TrainingError(503, "PAYMENTS_UNAVAILABLE", err.message);
    throw err;
  }

  const currency = (await readSetting(db, "currency")).code;
  const payment = await db.payment.create({
    data: { purpose: "COURSE", courseId: course.id, userId, amount: course.price, currency, status: "PENDING", provider: provider.name },
  });

  const result = await provider.charge({ amount: course.price, currency, reference: payment.id, simulate: options.simulate });
  if (result.status === "FAILED") {
    await db.payment.update({ where: { id: payment.id }, data: { status: "FAILED", providerReference: result.providerReference } });
    await db.auditLog.create({ data: { actorId: userId, action: "COURSE_PAYMENT_FAILED", targetType: "Payment", targetId: payment.id, metadata: { courseId: course.id } } });
    return { status: "FAILED", paymentId: payment.id, reason: result.failureReason ?? "The payment did not go through." };
  }

  const enrollment = await db.$transaction(async (tx) => {
    const created = await createEnrollment(tx, candidate.profileId, course.id);
    await tx.payment.update({ where: { id: payment.id }, data: { status: "SUCCESS", providerReference: result.providerReference, enrollmentId: created.id } });
    return created;
  });
  await db.auditLog.create({ data: { actorId: userId, action: "COURSE_PURCHASED", targetType: "Payment", targetId: payment.id, metadata: { courseId: course.id, amount: course.price, provider: provider.name } } });
  await notifyEnrolled(db, userId, candidate.name, course.title, course.id);
  return { status: "SUCCESS", enrollmentId: enrollment.id, paymentId: payment.id };
}

/**
 * Marks a lesson done (or not done) for the candidate's enrolment, recalculates progress, and when the last
 * lesson is done completes the course and tells the candidate. Only their own enrolment can be changed.
 */
export async function setLessonDone(db: Db, userId: string, lessonId: string, done: boolean) {
  const candidate = await candidateOf(db, userId);
  const lesson = await db.courseLesson.findUnique({ where: { id: lessonId }, include: { course: { select: { id: true, title: true, isActive: true } } } });
  if (!lesson || !lesson.course.isActive) throw new TrainingError(404, "LESSON_NOT_FOUND", "Lesson not found.");
  const enrollment = await db.enrollment.findUnique({ where: { candidateProfileId_courseId: { candidateProfileId: candidate.profileId, courseId: lesson.course.id } } });
  if (!enrollment) throw new TrainingError(403, "NOT_ENROLLED", "Enrol in the course first.");

  const outcome = await db.$transaction(async (tx) => {
    await tx.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
      create: { enrollmentId: enrollment.id, lessonId, completedAt: done ? new Date() : null },
      update: { completedAt: done ? new Date() : null },
    });
    const [total, finished] = await Promise.all([
      tx.courseLesson.count({ where: { courseId: lesson.course.id } }),
      tx.lessonProgress.count({ where: { enrollmentId: enrollment.id, completedAt: { not: null }, lesson: { courseId: lesson.course.id } } }),
    ]);
    const percent = progressPercent(finished, total);
    const status = percent >= 100 ? "COMPLETED" : finished > 0 ? "IN_PROGRESS" : "NOT_STARTED";
    const justCompleted = status === "COMPLETED" && enrollment.status !== "COMPLETED";
    await tx.enrollment.update({
      where: { id: enrollment.id },
      data: { progressPercent: percent, status, completedAt: status === "COMPLETED" ? (enrollment.completedAt ?? new Date()) : null },
    });
    return { percent, status, justCompleted };
  });

  if (outcome.justCompleted) {
    await db.auditLog.create({ data: { actorId: userId, action: "COURSE_COMPLETED", targetType: "Course", targetId: lesson.course.id } });
    await notifyUser(db, {
      userId,
      templateKey: "COURSE_COMPLETED_IN_APP",
      type: "TRAINING_UPDATE",
      values: { candidateName: candidate.name ?? "there", courseTitle: lesson.course.title },
      link: "/candidate/tests",
    });
  }
  return { progressPercent: outcome.percent, status: outcome.status as "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" };
}
