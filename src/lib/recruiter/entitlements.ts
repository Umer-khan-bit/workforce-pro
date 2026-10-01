import type { CompanyAccess } from "@/lib/companyPlan";
import { getCompanyAccess } from "@/lib/companyPlan";
import { FEATURE_KEYS, canAddMore, featureLimit, hasFeature } from "@/lib/planFeatures";

/**
 * What a company's plan lets its recruiters do. Every check goes through `hasFeature` / `featureLimit`
 * (never a plan's name or code), and a company with no plan, or one that has ended, has no features at all.
 */
export type Entitlements = {
  access: CompanyAccess;
  /** Search, shortlist and contact candidates at all ("Access to all candidates"). */
  canSearch: boolean;
  /** See and contact Top Performers, the candidates in the top quartile in every counted test ("Exclusive access to Q1 scorers"). */
  canSeeTopPerformers: boolean;
  canUseAiSearch: boolean;
  /** ATS and API access (used from Day 6). */
  canUseAts: boolean;
  /** Most shortlisted candidates in the pipeline; null = unlimited. */
  shortlistLimit: number | null;
  /** Most open job openings; null = unlimited. */
  openingLimit: number | null;
};

export function entitlementsFrom(access: CompanyAccess): Entitlements {
  const features = access.plan?.features ?? {};
  return {
    access,
    canSearch: hasFeature(features, FEATURE_KEYS.ALL_CANDIDATES),
    canSeeTopPerformers: hasFeature(features, FEATURE_KEYS.Q1_EXCLUSIVE),
    canUseAiSearch: hasFeature(features, FEATURE_KEYS.AI_SEARCH),
    canUseAts: hasFeature(features, FEATURE_KEYS.ATS_API_ACCESS),
    shortlistLimit: featureLimit(features, FEATURE_KEYS.MAX_SHORTLISTS),
    openingLimit: featureLimit(features, FEATURE_KEYS.MAX_JOB_OPENINGS),
  };
}

export async function getEntitlements(companyId: string): Promise<Entitlements> {
  return entitlementsFrom(await getCompanyAccess(companyId));
}

/** True when `used` entries still leave room for one more under the limit (null = unlimited). */
export function hasRoom(limit: number | null, used: number): boolean {
  return canAddMore({ [FEATURE_KEYS.MAX_SHORTLISTS]: limit }, FEATURE_KEYS.MAX_SHORTLISTS, used);
}

/** Wording for a plan-feature refusal, with the reason a company is blocked. */
export function planBlockMessage(e: Entitlements, what: string): string {
  if (e.access.state === "ended") return `Your plan has ended, so ${what} is switched off. Choose a plan under Subscription & billing.`;
  if (e.access.state === "none") return `Your company has no plan yet, so ${what} is not available. Choose a plan under Subscription & billing.`;
  return `Your plan does not include ${what}. You can upgrade under Subscription & billing.`;
}
