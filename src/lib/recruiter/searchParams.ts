import { RANKED_TESTS, SORTS, type RankedTest, type SearchFilters, type SearchSort } from "./searchTypes";

/** The search screen keeps everything in the address, so a search can be bookmarked, shared and paged. Pure helpers, usable in the browser too. */

export type SearchQuery = {
  filters: SearchFilters;
  sort: SearchSort;
  page: number;
  offer: number | null;
  opening: string | null;
};

type Raw = Record<string, string | string[] | undefined>;

const TEST_PARAM: Record<RankedTest, string> = { IQ: "iq", EQ: "eq", LANGUAGE: "language", SKILL: "skill" };

function first(raw: Raw, key: string): string | undefined {
  const v = raw[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s === undefined || s === "" ? undefined : s;
}

function int(raw: Raw, key: string, min: number, max: number): number | undefined {
  const s = first(raw, key);
  if (s === undefined || !/^-?\d+$/.test(s)) return undefined;
  return Math.min(max, Math.max(min, Number(s)));
}

export function parseSearchQuery(raw: Raw): SearchQuery {
  const filters: SearchFilters = {};
  const role = first(raw, "role");
  if (role) filters.jobRoleId = role.slice(0, 60);
  const city = first(raw, "city");
  if (city) filters.city = city.slice(0, 80);
  const minExperience = int(raw, "minExp", 0, 60);
  const maxExperience = int(raw, "maxExp", 0, 60);
  if (minExperience !== undefined) filters.minExperience = minExperience;
  if (maxExperience !== undefined) filters.maxExperience = maxExperience;
  for (const test of RANKED_TESTS) {
    const q = int(raw, `q_${TEST_PARAM[test]}`, 1, 4);
    if (q !== undefined) filters.quartiles = { ...filters.quartiles, [test]: q };
  }
  if (first(raw, "top") === "1") filters.topPerformersOnly = true;

  const sortRaw = first(raw, "sort");
  const sort = (SORTS as readonly string[]).includes(sortRaw ?? "") ? (sortRaw as SearchSort) : "overall";
  const offerRaw = int(raw, "offer", 1, 100_000_000);
  return { filters, sort, page: int(raw, "page", 1, 100_000) ?? 1, offer: offerRaw ?? null, opening: first(raw, "opening")?.slice(0, 60) ?? null };
}

/** The address query string for a search (empty values are left out). */
export function buildSearchQuery(q: Partial<SearchQuery>): string {
  const p = new URLSearchParams();
  const f = q.filters ?? {};
  if (f.jobRoleId) p.set("role", f.jobRoleId);
  if (f.city) p.set("city", f.city);
  if (f.minExperience !== undefined) p.set("minExp", String(f.minExperience));
  if (f.maxExperience !== undefined) p.set("maxExp", String(f.maxExperience));
  for (const test of RANKED_TESTS) {
    const v = f.quartiles?.[test];
    if (v !== undefined) p.set(`q_${TEST_PARAM[test]}`, String(v));
  }
  if (f.topPerformersOnly) p.set("top", "1");
  if (q.sort && q.sort !== "overall") p.set("sort", q.sort);
  if (q.offer) p.set("offer", String(q.offer));
  if (q.opening) p.set("opening", q.opening);
  if (q.page && q.page > 1) p.set("page", String(q.page));
  return p.toString();
}

export const TEST_PARAMS = TEST_PARAM;
