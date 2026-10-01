import { candidateSignupSchema } from "@/lib/validation";

/** The fields a candidate can edit on their own profile (same rules as at signup). */
export const profileUpdateSchema = candidateSignupSchema.pick({
  name: true,
  phone: true,
  cityId: true,
  regionId: true,
  experienceYears: true,
  jobRoleId: true,
  minimumSalary: true,
  gender: true,
});

export type ProfileSnapshot = {
  name: string | null;
  phone: string | null;
  city: string | null;
  regionId: string | null;
  experienceYears: number | null;
  jobRoleId: string | null;
  minimumSalary: number | null;
  gender: string | null;
};

const LABELS: Record<keyof ProfileSnapshot, string> = {
  name: "name",
  phone: "phone",
  city: "city",
  regionId: "region",
  experienceYears: "experience",
  jobRoleId: "job role",
  minimumSalary: "minimum salary",
  gender: "gender",
};

/**
 * Names of the profile fields that differ. Only the names go in the audit log: never the values,
 * because phone numbers and salaries must not be logged.
 */
export function changedProfileFields(before: ProfileSnapshot, after: ProfileSnapshot): string[] {
  return (Object.keys(LABELS) as (keyof ProfileSnapshot)[]).filter((k) => before[k] !== after[k]).map((k) => LABELS[k]);
}
