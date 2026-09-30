import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import ModuleGrid from "@/components/ModuleGrid";
import Stat from "@/components/Stat";
import { formatPkr } from "@/lib/companyPlan";

export default async function CandidateDashboard() {
  const session = await auth();
  const profile = await prisma.candidateProfile.findUnique({
    where: { userId: session!.user.id },
    include: { jobRole: true, region: true },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Welcome, {session?.user.name}</h1>
      <p className="mt-1 text-zinc-600">Your profile, progress and next steps.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Job role" value={profile?.jobRole?.name ?? "-"} />
        <Stat
          label="Location"
          value={profile?.city ?? "-"}
          hint={profile?.region?.name}
        />
        <Stat
          label="Experience"
          value={profile?.experienceYears != null ? `${profile.experienceYears} yrs` : "-"}
        />
        <Stat
          label="Minimum salary"
          value={profile?.minimumSalary != null ? formatPkr(profile.minimumSalary) : "-"}
          hint="per month"
        />
      </div>

      <ModuleGrid role="CANDIDATE" />
    </div>
  );
}
