/**
 * Payments go through this interface so a real gateway (PayFast, JazzCash, ...) can be plugged in later by
 * adding a class and one line in `getPaymentProvider`. In demo mode (DEMO_MODE=true) the simulated gateway
 * is used: it moves no money and lets the person trying the checkout choose success or failure.
 */
export type ChargeRequest = {
  amount: number;
  currency: string;
  /** Our own reference for this payment (the Payment row id). */
  reference: string;
  /** Simulated gateway only: the outcome to produce. A real gateway ignores it. */
  simulate?: "success" | "failure";
};

export type ChargeResult = { status: "SUCCESS" | "FAILED"; providerReference: string; failureReason?: string };

export interface PaymentProvider {
  /** Stored on the Payment row, for example "simulated" or "payfast". */
  readonly name: string;
  charge(request: ChargeRequest): Promise<ChargeResult>;
}

export class SimulatedPaymentProvider implements PaymentProvider {
  readonly name = "simulated";

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    const ref = `SIM-${request.reference.slice(-8).toUpperCase()}`;
    if (request.simulate === "failure") {
      return { status: "FAILED", providerReference: ref, failureReason: "The simulated payment was declined." };
    }
    return { status: "SUCCESS", providerReference: ref };
  }
}

export class PaymentsUnavailableError extends Error {
  constructor() {
    super("Payments are not available right now.");
    this.name = "PaymentsUnavailableError";
  }
}

/** True in demo mode, where the simulated gateway is allowed. */
export const isDemoPayments = (env: Record<string, string | undefined> = process.env) => env.DEMO_MODE === "true";

/**
 * The provider for this environment. Only the simulated gateway exists today, and only in demo mode, so a
 * live site can never "charge" anyone for free by accident. To go live: add a provider class and return it
 * here when PAYMENT_PROVIDER names it.
 */
export function getPaymentProvider(env: Record<string, string | undefined> = process.env): PaymentProvider {
  if (isDemoPayments(env)) return new SimulatedPaymentProvider();
  throw new PaymentsUnavailableError();
}
