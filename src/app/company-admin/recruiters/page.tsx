import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import LogoutButton from "@/components/LogoutButton";
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
    <div className="mx-auto flex max-w-3xl flex-1 flex-col px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Recruiters</h1>
        <LogoutButton />
      </div>
      <Link href="/company-admin" className="mt-1 text-sm underline">
        Back to dashboard
      </Link>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        Add recruiters to your company. Each one gets a temporary password and must change it on
        first login.
      </p>
      <RecruitersManager
        initialRecruiters={recruiters.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
      />
    </div>
  );
}
