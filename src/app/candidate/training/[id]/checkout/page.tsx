import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrency } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { isDemoPayments } from "@/lib/payments/provider";
import { CheckoutForm } from "../CourseActions";

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const profile = await prisma.candidateProfile.findFirst({ where: { userId: session!.user.id, anonymisedAt: null }, select: { id: true, jobRoleId: true } });
  if (!profile) redirect("/login");

  const course = await prisma.course.findFirst({
    where: { id, isActive: true, OR: [{ jobRoleId: null }, ...(profile.jobRoleId ? [{ jobRoleId: profile.jobRoleId }] : [])] },
  });
  if (!course) notFound();
  if (course.isFree) redirect(`/candidate/training/${course.id}`);
  const enrolled = await prisma.enrollment.findUnique({ where: { candidateProfileId_courseId: { candidateProfileId: profile.id, courseId: course.id } } });
  if (enrolled) redirect(`/candidate/training/${course.id}`);

  const [currency, user] = await Promise.all([getCurrency(), prisma.user.findUnique({ where: { id: session!.user.id }, select: { emailVerified: true } })]);
  const amount = formatMoney(course.price, currency);
  const demo = isDemoPayments();

  return (
    <div className="max-w-xl">
      <Link href={`/candidate/training/${course.id}`} className="text-sm text-brand-700 underline">&larr; {course.title}</Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Checkout</h1>

      <section className="card mt-5" aria-labelledby="order-h">
        <h2 id="order-h" className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Your order</h2>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <p className="font-medium text-zinc-900">{course.title}</p>
          <p className="text-lg font-semibold text-zinc-900" data-testid="order-total">{amount}</p>
        </div>
      </section>

      {demo && (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="demo-notice">
          <strong>Demo mode.</strong> No real money moves. Choose whether the simulated payment succeeds or fails.
        </p>
      )}
      {!user?.emailVerified && (
        <p role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">Confirm your email address before paying. Use the banner above to get a new link.</p>
      )}

      <div className="mt-5">
        <CheckoutForm courseId={course.id} amountLabel={amount} demo={demo} />
      </div>
    </div>
  );
}
