import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import RecruitersManager from "./RecruitersManager";

export default async function RecruitersPage() {
  const session = await auth();
  const companyId = session!.user.companyId!;

  const recruiters = await prisma.user.findMany({
    where: { companyId, role: "RECRUITER" },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Recruiters</h1>
      <p className="mt-2 text-zinc-600">
        Add recruiters to your company. Each one gets a temporary password and must change it on
        first login.
      </p>
      <RecruitersManager
        initialRecruiters={recruiters.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
      />
    </div>
  );
}
