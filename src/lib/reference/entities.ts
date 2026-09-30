import { z } from "zod";
import type { PrismaClient } from "@prisma/client";

/**
 * Admin-editable lookup data: job roles, regions, languages, cities, the region-to-language map,
 * experience bands and salary benchmarks. Validation and database access live here so one pair of
 * API routes can serve all of them.
 */
const name = z.string().trim().min(1, "Name is required").max(100);
const optionalText = z
  .string()
  .trim()
  .max(300)
  .nullish()
  .transform((v) => v || null);
const money = z.coerce.number().int().min(0).max(100_000_000);

export const REFERENCE_SCHEMAS = {
  "job-roles": z.object({ name, description: optionalText, isActive: z.boolean() }),
  regions: z.object({ name, isActive: z.boolean() }),
  languages: z.object({
    name,
    code: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z]{2,8}(-[a-z0-9]{2,8})?$/, "Use a language code such as en or ur"),
    isActive: z.boolean(),
    isDefault: z.boolean(),
  }),
  cities: z.object({ name, regionId: z.string().min(1, "Region is required"), isActive: z.boolean() }),
  "region-languages": z.object({
    regionId: z.string().min(1, "Region is required"),
    languageId: z.string().min(1, "Language is required"),
    isPrimary: z.boolean(),
  }),
  "experience-bands": z
    .object({
      label: z.string().trim().min(1, "Label is required").max(40),
      minYears: z.coerce.number().int().min(0).max(60),
      maxYears: z.coerce.number().int().min(0).max(60).nullable(),
      sortOrder: z.coerce.number().int().min(0).max(1000),
    })
    .refine((b) => b.maxYears === null || b.maxYears >= b.minYears, {
      message: "Maximum years cannot be below minimum years",
      path: ["maxYears"],
    }),
  "salary-benchmarks": z
    .object({
      jobRoleId: z.string().min(1, "Job role is required"),
      city: z.string().trim().min(1, "City is required").max(100),
      experienceBandId: z.string().min(1, "Experience band is required"),
      minSalary: money,
      avgSalary: money,
      maxSalary: money,
    })
    .refine((b) => b.minSalary <= b.avgSalary && b.avgSalary <= b.maxSalary, {
      message: "Salaries must run from minimum up to average up to maximum",
      path: ["avgSalary"],
    }),
} as const;

export type ReferenceEntity = keyof typeof REFERENCE_SCHEMAS;

export function isReferenceEntity(value: string): value is ReferenceEntity {
  return value in REFERENCE_SCHEMAS;
}

export const AUDIT_NAMES: Record<ReferenceEntity, string> = {
  "job-roles": "JobRole",
  regions: "Region",
  languages: "Language",
  cities: "City",
  "region-languages": "RegionLanguage",
  "experience-bands": "ExperienceBand",
  "salary-benchmarks": "SalaryBenchmark",
};

type Data = Record<string, unknown>;
export class RuleError extends Error {}

/** Extra rules that need the database. Throws RuleError with a message to show the admin. */
async function checkRules(prisma: PrismaClient, entity: ReferenceEntity, data: Data, id?: string) {
  if (entity === "languages") {
    if (data.isDefault && !data.isActive) throw new RuleError("The default language must be active");
    if (id && !data.isDefault) {
      const current = await prisma.language.findUnique({ where: { id } });
      if (current?.isDefault) {
        throw new RuleError("Choose another language as the default first");
      }
    }
  }
  if (entity === "salary-benchmarks") {
    const city = await prisma.city.findFirst({ where: { name: data.city as string } });
    if (!city) throw new RuleError("Choose a city from the cities list");
  }
}

export async function createReference(prisma: PrismaClient, entity: ReferenceEntity, data: Data) {
  await checkRules(prisma, entity, data);
  switch (entity) {
    case "job-roles":
      return prisma.jobRole.create({ data: data as never });
    case "regions":
      return prisma.region.create({ data: data as never });
    case "languages":
      return prisma.$transaction(async (tx) => {
        if (data.isDefault) await tx.language.updateMany({ data: { isDefault: false } });
        return tx.language.create({ data: data as never });
      });
    case "cities":
      return prisma.city.create({ data: data as never });
    case "region-languages":
      return prisma.regionLanguage.create({ data: data as never });
    case "experience-bands":
      return prisma.experienceBand.create({ data: data as never });
    case "salary-benchmarks":
      return prisma.salaryBenchmark.create({ data: data as never });
  }
}

export async function updateReference(prisma: PrismaClient, entity: ReferenceEntity, id: string, data: Data) {
  await checkRules(prisma, entity, data, id);
  const where = { id };
  switch (entity) {
    case "job-roles":
      return prisma.jobRole.update({ where, data: data as never });
    case "regions":
      return prisma.region.update({ where, data: data as never });
    case "languages":
      return prisma.$transaction(async (tx) => {
        if (data.isDefault) await tx.language.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
        return tx.language.update({ where, data: data as never });
      });
    case "cities":
      return prisma.city.update({ where, data: data as never });
    case "region-languages":
      return prisma.regionLanguage.update({ where, data: data as never });
    case "experience-bands":
      return prisma.experienceBand.update({ where, data: data as never });
    case "salary-benchmarks":
      return prisma.salaryBenchmark.update({ where, data: data as never });
  }
}

export async function deleteReference(prisma: PrismaClient, entity: ReferenceEntity, id: string) {
  const where = { id };
  switch (entity) {
    case "job-roles":
      return prisma.jobRole.delete({ where });
    case "regions":
      return prisma.region.delete({ where });
    case "languages": {
      const lang = await prisma.language.findUnique({ where });
      if (lang?.isDefault) throw new RuleError("The default language cannot be deleted");
      return prisma.language.delete({ where });
    }
    case "cities":
      return prisma.city.delete({ where });
    case "region-languages":
      return prisma.regionLanguage.delete({ where });
    case "experience-bands":
      return prisma.experienceBand.delete({ where });
    case "salary-benchmarks":
      return prisma.salaryBenchmark.delete({ where });
  }
}
