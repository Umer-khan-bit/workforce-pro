import { prisma } from "@/lib/prisma";
import CandidateSignupForm from "./CandidateSignupForm";

export default async function CandidateSignupPage() {
  const [regions, jobRoles] = await Promise.all([
    prisma.region.findMany({ orderBy: { name: "asc" } }),
    prisma.jobRole.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Candidate sign up
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Take the assessments, get ranked, and get discovered by recruiters.
        </p>
        <CandidateSignupForm regions={regions} jobRoles={jobRoles} />
      </div>
    </div>
  );
}
