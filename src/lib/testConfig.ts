import { z } from "zod";

export const testConfigSchema = z
  .object({
    minItems: z.coerce.number().int().min(1).max(200),
    maxItems: z.coerce.number().int().min(1).max(200),
    seThreshold: z.coerce.number().min(0.05).max(1),
    timeLimitMinutes: z.coerce.number().int().min(1).max(240),
    retakeWaitingDays: z.coerce.number().int().min(0).max(365),
    pretestItemCount: z.coerce.number().int().min(0).max(20),
  })
  .refine((t) => t.minItems <= t.maxItems, {
    message: "Minimum questions cannot be more than maximum questions",
    path: ["minItems"],
  })
  .refine((t) => t.pretestItemCount <= t.maxItems, {
    message: "Pretest questions cannot be more than maximum questions",
    path: ["pretestItemCount"],
  });
