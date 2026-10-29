/** The shared vocabulary of recruiter search. No server code in here, so pages in the browser can import it too. */

/** The four tests that are ranked into quartiles (Personality has no better or worse direction). */
export const RANKED_TESTS = ["IQ", "EQ", "LANGUAGE", "SKILL"] as const;
export type RankedTest = (typeof RANKED_TESTS)[number];

export const SORTS = ["overall", "experience", "iq", "eq", "language", "skill"] as const;
export type SearchSort = (typeof SORTS)[number];

export type SearchFilters = {
  jobRoleId?: string;
  city?: string;
  minExperience?: number;
  maxExperience?: number;
  /** Per test: the weakest quartile accepted (1 = only Q1, 2 = Q1 or Q2, ...). */
  quartiles?: Partial<Record<RankedTest, number>>;
  /** Only Top Performers: the quartile in every test the top-performer rule counts. */
  topPerformersOnly?: boolean;
  /** Leave out candidates whose integrity is at or above the threshold in Settings > Tests (cleared flags and voided results count as no concern). */
  noIntegrityConcerns?: boolean;
};
