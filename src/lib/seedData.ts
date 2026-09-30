/**
 * Starting values for admin-editable data, written by the seed. After seeding, the database is
 * the source of truth and everything here is edited in the Platform admin panel.
 */

export const FEATURE_SEEDS = [
  { key: "allCandidates", label: "Access to all candidates", kind: "BOOLEAN", sortOrder: 1,
    description: "Search and shortlist every assessed candidate." },
  { key: "q1Exclusive", label: "Exclusive access to Q1 scorers", kind: "BOOLEAN", sortOrder: 2,
    description: "See candidates in the top quartile before others can." },
  { key: "aiSearch", label: "AI plain-language search", kind: "BOOLEAN", sortOrder: 3,
    description: "Search candidates by describing who you need." },
  { key: "atsApiAccess", label: "ATS and API access", kind: "BOOLEAN", sortOrder: 4,
    description: "Push candidates to an ATS, use webhooks and API keys." },
  { key: "maxShortlists", label: "Maximum shortlisted candidates", kind: "LIMIT", sortOrder: 5,
    description: "Empty means unlimited." },
  { key: "maxJobOpenings", label: "Maximum open job openings", kind: "LIMIT", sortOrder: 6,
    description: "Empty means unlimited." },
] as const;

export const PLAN_SEEDS = [
  {
    code: "basic",
    name: "Basic",
    description: "Every assessed candidate.",
    priceMonthly: 15000,
    sortOrder: 1,
    features: { allCandidates: true, q1Exclusive: false, aiSearch: false, atsApiAccess: false, maxShortlists: 25, maxJobOpenings: 5 },
  },
  {
    code: "advanced",
    name: "Advanced",
    description: "Adds exclusive access to Q1 scorers, AI search and ATS/API access.",
    priceMonthly: 40000,
    sortOrder: 2,
    features: { allCandidates: true, q1Exclusive: true, aiSearch: true, atsApiAccess: true, maxShortlists: null, maxJobOpenings: null },
  },
];

/** Adaptive tests (IQ, Language, Skill) use the SE stop rule; fixed-length tests serve min = max items. */
export const TEST_CONFIG_SEEDS = [
  { testType: "PERSONALITY", minItems: 50, maxItems: 50, seThreshold: 0.35, timeLimitMinutes: 15, retakeWaitingDays: 30, pretestItemCount: 0 },
  { testType: "EQ", minItems: 20, maxItems: 20, seThreshold: 0.35, timeLimitMinutes: 15, retakeWaitingDays: 30, pretestItemCount: 0 },
  { testType: "IQ", minItems: 10, maxItems: 20, seThreshold: 0.35, timeLimitMinutes: 15, retakeWaitingDays: 30, pretestItemCount: 2 },
  { testType: "LANGUAGE", minItems: 10, maxItems: 20, seThreshold: 0.35, timeLimitMinutes: 20, retakeWaitingDays: 30, pretestItemCount: 2 },
  { testType: "SKILL", minItems: 10, maxItems: 20, seThreshold: 0.35, timeLimitMinutes: 15, retakeWaitingDays: 30, pretestItemCount: 2 },
] as const;

export const EXPERIENCE_BAND_SEEDS = [
  { label: "0-1 years", minYears: 0, maxYears: 1, sortOrder: 1 },
  { label: "2-4 years", minYears: 2, maxYears: 4, sortOrder: 2 },
  { label: "5-9 years", minYears: 5, maxYears: 9, sortOrder: 3 },
  { label: "10+ years", minYears: 10, maxYears: null, sortOrder: 4 },
];

// Weighted roughly by population (the weight is only used to spread demo candidates).
export const CITY_SEEDS: Array<{ city: string; region: string; weight: number }> = [
  { city: "Karachi", region: "Sindh", weight: 16 },
  { city: "Lahore", region: "Punjab", weight: 16 },
  { city: "Islamabad", region: "Islamabad Capital Territory", weight: 8 },
  { city: "Rawalpindi", region: "Punjab", weight: 7 },
  { city: "Faisalabad", region: "Punjab", weight: 7 },
  { city: "Multan", region: "Punjab", weight: 5 },
  { city: "Gujranwala", region: "Punjab", weight: 4 },
  { city: "Sialkot", region: "Punjab", weight: 3 },
  { city: "Hyderabad", region: "Sindh", weight: 5 },
  { city: "Sukkur", region: "Sindh", weight: 2 },
  { city: "Peshawar", region: "Khyber Pakhtunkhwa", weight: 6 },
  { city: "Mardan", region: "Khyber Pakhtunkhwa", weight: 2 },
  { city: "Abbottabad", region: "Khyber Pakhtunkhwa", weight: 2 },
  { city: "Quetta", region: "Balochistan", weight: 4 },
  { city: "Gilgit", region: "Gilgit-Baltistan", weight: 1 },
  { city: "Muzaffarabad", region: "Azad Kashmir", weight: 1 },
];

export const PRIVACY_POLICY_SEED = {
  kind: "PRIVACY",
  version: "1.0",
  title: "Privacy Policy",
  body: [
    "This is a placeholder privacy policy. It will be replaced with the final legal text before launch.",
    "We collect the information you provide at signup (name, contact details, region, job role and salary expectations) and your assessment responses, in order to score your tests, match you with relevant job openings, and let recruiters search and shortlist candidates.",
    "Your test answers are never sold or shared outside this platform. Recruiters can only see your scores, quartile ranking and profile details - not your raw answers.",
  ].join("\n\n"),
};

/** Typical monthly salary for a fresher, and the rise per year of experience (sample benchmarks). */
export const SALARY_BENCHMARK_SEEDS: Record<string, { base: number; perYear: number }> = {
  Accountant: { base: 50000, perYear: 8000 },
  Sales: { base: 45000, perYear: 9000 },
  "Customer Service": { base: 38000, perYear: 6000 },
  "IT Support": { base: 50000, perYear: 10000 },
};
