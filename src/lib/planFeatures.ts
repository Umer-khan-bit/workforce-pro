import { z } from "zod";

/**
 * Plan features are on/off switches and numeric limits stored in the database (Plan.features,
 * described by PlanFeature rows). Access checks anywhere in the app must call these helpers
 * with a plan's features. Never compare a plan's name or code.
 */
export const FEATURE_KEYS = {
  ALL_CANDIDATES: "allCandidates",
  Q1_EXCLUSIVE: "q1Exclusive",
  AI_SEARCH: "aiSearch",
  ATS_API_ACCESS: "atsApiAccess",
  MAX_SHORTLISTS: "maxShortlists",
  MAX_JOB_OPENINGS: "maxJobOpenings",
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

/** true/false for on-off features; a number, or null for "unlimited", for limits. */
export type FeatureValue = boolean | number | null;
export type PlanFeatures = Record<string, FeatureValue>;

function asRecord(features: unknown): Record<string, unknown> {
  return features && typeof features === "object" && !Array.isArray(features)
    ? (features as Record<string, unknown>)
    : {};
}

/** True only when the feature is explicitly switched on. A missing feature is off. */
export function hasFeature(features: unknown, key: FeatureKey): boolean {
  return asRecord(features)[key] === true;
}

/**
 * The numeric limit for a feature: a number, `null` for unlimited, or 0 when the plan does not
 * define it (no plan or missing value means no allowance, never unlimited by accident).
 */
export function featureLimit(features: unknown, key: FeatureKey): number | null {
  const value = asRecord(features)[key];
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** Whether `currentCount` items still leaves room to add one more under the plan's limit. */
export function canAddMore(features: unknown, key: FeatureKey, currentCount: number): boolean {
  const limit = featureLimit(features, key);
  return limit === null || currentCount < limit;
}

export type FeatureDefinition = { key: string; kind: "BOOLEAN" | "LIMIT" };

/**
 * Checks admin input against the feature definitions in the database and returns clean values.
 * Unknown keys are rejected; every defined feature must be present.
 */
export function parsePlanFeatures(
  definitions: FeatureDefinition[],
  input: unknown
): { ok: true; features: PlanFeatures } | { ok: false; error: string } {
  const shape: Record<string, z.ZodType> = {};
  for (const def of definitions) {
    shape[def.key] =
      def.kind === "BOOLEAN"
        ? z.boolean()
        : z.union([z.null(), z.coerce.number().int().min(0).max(1_000_000)]);
  }
  const result = z.object(shape).strict().safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { ok: false, error: `Invalid plan feature "${issue.path.join(".") || "features"}": ${issue.message}` };
  }
  return { ok: true, features: result.data as PlanFeatures };
}
