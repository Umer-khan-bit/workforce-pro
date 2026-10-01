import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { readSetting } from "@/lib/settings/store";
import { renderTemplate } from "@/lib/messageTemplates";
import { askClaudeJson, getClaudeClient, type ClaudeClient } from "@/lib/ai/claude";
import { estimateCost } from "@/lib/ai/cost";
import { AiError, toAiError } from "@/lib/ai/errors";
import { RANKED_TESTS, SORTS, type SearchFilters, type SearchSort } from "./searchTypes";

export const SEARCH_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["jobRole", "city", "minExperienceYears", "maxExperienceYears", "iqMaxQuartile", "eqMaxQuartile", "languageMaxQuartile", "skillMaxQuartile", "topPerformersOnly", "sort"],
  properties: {
    jobRole: { anyOf: [{ type: "string" }, { type: "null" }] },
    city: { anyOf: [{ type: "string" }, { type: "null" }] },
    minExperienceYears: { anyOf: [{ type: "integer" }, { type: "null" }] },
    maxExperienceYears: { anyOf: [{ type: "integer" }, { type: "null" }] },
    iqMaxQuartile: { anyOf: [{ type: "integer" }, { type: "null" }] },
    eqMaxQuartile: { anyOf: [{ type: "integer" }, { type: "null" }] },
    languageMaxQuartile: { anyOf: [{ type: "integer" }, { type: "null" }] },
    skillMaxQuartile: { anyOf: [{ type: "integer" }, { type: "null" }] },
    topPerformersOnly: { type: "boolean" },
    sort: { anyOf: [{ type: "string", enum: [...SORTS] }, { type: "null" }] },
  },
} as const;

const replySchema = z.object({
  jobRole: z.string().nullable(),
  city: z.string().nullable(),
  minExperienceYears: z.number().nullable(),
  maxExperienceYears: z.number().nullable(),
  iqMaxQuartile: z.number().nullable(),
  eqMaxQuartile: z.number().nullable(),
  languageMaxQuartile: z.number().nullable(),
  skillMaxQuartile: z.number().nullable(),
  topPerformersOnly: z.boolean(),
  sort: z.string().nullable(),
});
export type SearchReply = z.infer<typeof replySchema>;

export type ParsedSearch = {
  filters: SearchFilters;
  sort: SearchSort | null;
  /** A plain-language line describing what was understood, shown above the results. */
  summary: string;
  /** Parts of the request that could not be used (for example a city or role that does not exist). */
  notes: string[];
};

type Lists = { roles: { id: string; name: string }[]; cities: string[] };

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Turns Claude's answer into real filters. Nothing from the model is trusted: roles and cities must exist in
 * the database (matched by name), quartiles are clamped to 1-4, experience to a sane range. Anything that does
 * not check out is dropped and listed in `notes`, so the recruiter can see what was not applied.
 */
export function validateSearchReply(reply: SearchReply, lists: Lists): ParsedSearch {
  const filters: SearchFilters = {};
  const notes: string[] = [];
  const parts: string[] = [];

  if (reply.jobRole) {
    const role = lists.roles.find((r) => norm(r.name) === norm(reply.jobRole!));
    if (role) {
      filters.jobRoleId = role.id;
      parts.push(role.name);
    } else notes.push(`There is no job role called "${reply.jobRole.slice(0, 40)}", so the role was not used.`);
  }
  if (reply.city) {
    const city = lists.cities.find((c) => norm(c) === norm(reply.city!));
    if (city) {
      filters.city = city;
      parts.push(`in ${city}`);
    } else notes.push(`There is no city called "${reply.city.slice(0, 40)}", so the city was not used.`);
  }
  const years = (n: number | null) => (n === null || !Number.isFinite(n) ? undefined : Math.min(60, Math.max(0, Math.round(n))));
  const [minY, maxY] = [years(reply.minExperienceYears), years(reply.maxExperienceYears)];
  if (minY !== undefined && maxY !== undefined && minY > maxY) notes.push("The experience range was back to front, so it was not used.");
  else {
    if (minY !== undefined) filters.minExperience = minY;
    if (maxY !== undefined) filters.maxExperience = maxY;
    if (minY !== undefined && maxY !== undefined) parts.push(`${minY} to ${maxY} years of experience`);
    else if (minY !== undefined) parts.push(`at least ${minY} years of experience`);
    else if (maxY !== undefined) parts.push(`up to ${maxY} years of experience`);
  }
  const wanted: Record<(typeof RANKED_TESTS)[number], number | null> = { IQ: reply.iqMaxQuartile, EQ: reply.eqMaxQuartile, LANGUAGE: reply.languageMaxQuartile, SKILL: reply.skillMaxQuartile };
  for (const test of RANKED_TESTS) {
    const q = wanted[test];
    if (q === null || !Number.isFinite(q)) continue;
    const max = Math.min(4, Math.max(1, Math.round(q)));
    filters.quartiles = { ...filters.quartiles, [test]: max };
    parts.push(`${test === "SKILL" ? "job skill" : test.toLowerCase()} in Q${max}${max > 1 ? " or better" : ""}`);
  }
  if (reply.topPerformersOnly) {
    filters.topPerformersOnly = true;
    parts.push("Top Performers only");
  }
  const sort = (SORTS as readonly string[]).includes(reply.sort ?? "") ? (reply.sort as SearchSort) : null;
  return { filters, sort, summary: parts.length ? `Looking for: ${parts.join(", ")}.` : "Nothing in the request could be turned into a filter.", notes };
}

type Db = Pick<PrismaClient, "jobRole" | "city" | "siteSetting" | "aiRun">;

/**
 * Reads a recruiter's plain-language request with Claude (prompt and model in Settings) and returns filters for
 * the normal search. Only the request text and the lists of job roles and cities are sent: no candidate data.
 * The run is recorded in AiRun, without the request text.
 */
export async function parseSearchRequest(deps: { prisma: Db; client?: ClaudeClient }, userId: string, query: string): Promise<ParsedSearch> {
  const { prisma } = deps;
  const text = query.trim().slice(0, 500);
  const [roles, cities, ai, prompts, aiGeneration] = await Promise.all([
    prisma.jobRole.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.city.findMany({ where: { isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
    readSetting(prisma, "aiResults"),
    readSetting(prisma, "aiPrompts"),
    readSetting(prisma, "aiGeneration"),
  ]);
  const cityNames = [...new Set(cities.map((c) => c.name))];

  const run = await prisma.aiRun.create({ data: { kind: "SEARCH", actorId: userId, model: ai.model, reviewModel: ai.model, requested: 1 } });
  try {
    const client = deps.client ?? getClaudeClient();
    const user = renderTemplate(prompts.searchPrompt, { roles: roles.map((r) => r.name).join(", "), cities: cityNames.join(", "), query: `"""${text}"""` });
    const reply = await askClaudeJson(client, { model: ai.model, system: prompts.systemPrompt, user, schema: SEARCH_JSON_SCHEMA, maxTokens: Math.min(ai.maxOutputTokens, 1500), effort: ai.effort });
    const parsed = replySchema.safeParse(reply.data);
    if (!parsed.success) throw new AiError("BAD_RESPONSE", "The search reply did not have the expected shape. Try again.");
    const cost = estimateCost(reply.usage, aiGeneration.inputPricePerMTok, aiGeneration.outputPricePerMTok);
    await prisma.aiRun.update({ where: { id: run.id }, data: { created: 1, inputTokens: reply.usage.inputTokens, outputTokens: reply.usage.outputTokens, costEstimate: cost, status: "COMPLETED" } });
    return validateSearchReply(parsed.data, { roles, cities: cityNames });
  } catch (err) {
    const aiError = toAiError(err);
    await prisma.aiRun.update({ where: { id: run.id }, data: { status: "FAILED", error: `${aiError.code}: ${aiError.message}` } });
    throw aiError;
  }
}
