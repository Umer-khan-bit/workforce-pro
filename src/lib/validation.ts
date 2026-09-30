import { z } from "zod";

export const candidateSignupSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  phone: z.string().trim().min(7).max(20),
  city: z.string().trim().min(2).max(100),
  regionId: z.string().min(1, "Region is required"),
  experienceYears: z.coerce.number().int().min(0).max(60),
  jobRoleId: z.string().min(1, "Job role is required"),
  minimumSalary: z.coerce.number().int().min(0),
  consentGiven: z
    .boolean()
    .refine((v) => v === true, { message: "You must accept the privacy policy" }),
});

export const companySignupSchema = z.object({
  companyName: z.string().trim().min(2).max(150),
  industry: z.string().trim().max(100).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  adminName: z.string().trim().min(2).max(100),
  adminEmail: z.string().trim().toLowerCase().email(),
  adminPassword: z.string().min(8).max(200),
});

export const recruiterCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});
