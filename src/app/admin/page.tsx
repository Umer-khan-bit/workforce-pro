import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import ModuleGrid from "@/components/ModuleGrid";
import Stat from "@/components/Stat";

export default async function PlatformAdminDashboard() {
  const session = await auth();

  const [candidates, companies, recruiters, activeSubscriptions] = await Promise.all([
    prisma.candidateProfile.count(),
    prisma.company.count(),
    prisma.user.count({ where: { role: "RECRUITER" } }),
    prisma.subscription.count({ where: { status: { in: ["ACTIVE", "TRIALING"] } } }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Welcome, {session?.user.name}</h1>
      <p className="mt-1 text-zinc-600">Platform health and activity.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Candidates" value={candidates} />
        <Stat label="Companies" value={companies} />
        <Stat label="Recruiters" value={recruiters} />
        <Stat label="Active subscriptions" value={activeSubscriptions} />
      </div>

      <ModuleGrid role="PLATFORM_ADMIN" />
    </div>
  );
}
