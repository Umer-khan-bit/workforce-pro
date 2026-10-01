import { z } from "zod";
import { TEST_TYPES } from "@/lib/questionBank/schema";

const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

export const courseInputSchema = z
  .object({
    title: z.string().trim().min(2, "Title is too short").max(120),
    description: z.preprocess(emptyToUndefined, z.string().trim().max(2000).optional()),
    isFree: z.boolean(),
    price: z.coerce.number().int().min(0).max(10_000_000).default(0),
    jobRoleId: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    testType: z.preprocess(emptyToUndefined, z.enum(TEST_TYPES).optional()),
    isActive: z.boolean().default(true),
  })
  .superRefine((c, ctx) => {
    if (!c.isFree && c.price <= 0) ctx.addIssue({ code: "custom", path: ["price"], message: "A paid course needs a price above zero" });
  })
  .transform((c) => ({ ...c, price: c.isFree ? 0 : c.price }));

export type CourseInput = z.infer<typeof courseInputSchema>;

export const lessonInputSchema = z.object({
  title: z.string().trim().min(2, "Title is too short").max(150),
  content: z.preprocess(emptyToUndefined, z.string().trim().max(20_000).optional()),
  durationMinutes: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(600).optional()),
});

export const lessonPatchSchema = lessonInputSchema.partial().extend({ direction: z.enum(["up", "down"]).optional() });
