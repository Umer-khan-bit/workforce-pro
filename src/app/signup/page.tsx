import { prisma } from "@/lib/prisma";
import CandidateSignupForm from "./CandidateSignupForm";
import PublicPage from "@/components/PublicPage";

export default async function CandidateSignupPage() {
  const [regions, jobRoles, cities] = await Promise.all([
    prisma.region.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.jobRole.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.city.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <PublicPage width="lg">
      <h1 className="text-2xl font-semibold text-zinc-900">
        Candidate sign up
      </h1>
      <p className="mt-1 text-sm text-zinc-600">
        Take the assessments, get ranked, and get discovered by recruiters.
      </p>
      <CandidateSignupForm
        regions={regions}
        jobRoles={jobRoles}
        cities={cities.map((c) => ({ id: c.id, name: c.name, regionId: c.regionId }))}
      />
    </PublicPage>
  );
}
