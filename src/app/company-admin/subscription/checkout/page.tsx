import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrency } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { isDemoPayments } from "@/lib/payments/provider";
import { BillingError, quoteForCompany } from "@/lib/subscriptions";
import PlanCheckoutForm from "./PlanCheckoutForm";

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const TITLE = { new: "Start this plan", upgrade: "Upgrade your plan", downgrade: "Switch to a lower plan", renew: "Renew your plan" } as const;

/** Checkout for a plan change: what you pay, what you get, then pay (simulated in demo mode). */
export default async function PlanCheckoutPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).plan;
  const code = Array.isArray(raw) ? raw[0] : raw;
  if (!code) notFound();
  const session = await auth();
  const companyId = session!.user.companyId!;

  let quote;
  try {
    quote = await quoteForCompany(prisma, companyId, code);
  } catch (err) {
    if (err instanceof BillingError) notFound();
    throw err;
  }
  const [currency, user] = await Promise.all([getCurrency(), prisma.user.findUnique({ where: { id: session!.user.id }, select: { emailVerified: true } })]);
  const money = (n: number) => formatMoney(n, currency);
  const demo = isDemoPayments();

  return (
    <div className="max-w-xl">
      <Link href="/company-admin/subscription" className="text-sm text-brand-700 underline">&larr; Subscription &amp; billing</Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900" data-testid="checkout-title">{TITLE[quote.kind]}: {quote.plan.name}</h1>

      <section className="card mt-5" aria-labelledby="order-h">
        <h2 id="order-h" className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Your order</h2>
        <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
          <dt className="text-zinc-700">{quote.plan.name} plan for {quote.periodDays} days</dt>
          <dd className="tabular-nums" data-testid="order-price">{money(quote.price)}</dd>
          {quote.credit > 0 && (
            <>
              <dt className="text-zinc-700">Credit for the unused part of your current plan</dt>
              <dd className="tabular-nums text-green-700" data-testid="order-credit">- {money(quote.credit)}</dd>
            </>
          )}
          <dt className="border-t border-zinc-200 pt-2 font-semibold text-zinc-900">To pay now</dt>
          <dd className="border-t border-zinc-200 pt-2 text-lg font-semibold tabular-nums text-zinc-900" data-testid="order-total">{money(quote.amountDue)}</dd>
        </dl>
        <p className="mt-3 text-sm text-zinc-600">The {quote.plan.name} plan starts now and runs until {fmt(quote.endsAt)}. It replaces your current plan straight away.</p>
      </section>

      {demo && quote.amountDue > 0 && (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="demo-notice">
          <strong>Demo mode.</strong> No real money moves. Choose whether the simulated payment succeeds or fails.
        </p>
      )}
      {!user?.emailVerified && <p role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">Confirm your email address before paying. Use the banner above to get a new link.</p>}

      <div className="mt-5">
        <PlanCheckoutForm planCode={quote.plan.code} amountLabel={money(quote.amountDue)} free={quote.amountDue === 0} demo={demo} />
      </div>
    </div>
  );
}
