import { z } from "zod";

/** Validation for creating and editing plans. The `features` object is checked separately against the feature definitions. */
const base = {
  name: z.string().trim().min(1, "Name is required").max(60),
  description: z
    .string()
    .trim()
    .max(300)
    .nullish()
    .transform((v) => v || null),
  priceMonthly: z.coerce.number().int().min(0).max(100_000_000),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(1000),
  features: z.unknown(),
};

export const planUpdateSchema = z.object(base);

export const planCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,29}$/, "Use 2-30 lowercase letters, numbers or dashes"),
  ...base,
});

export const planFeatureUpdateSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(80),
  description: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .transform((v) => v || null),
});
