import Link from "next/link";
import { auth } from "@/auth";
import LogoutButton from "@/components/LogoutButton";

export default async function CompanyAdminDashboard() {
  const session = await auth();

  return (
    <div className="mx-auto flex max-w-3xl flex-1 flex-col px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Welcome, {session?.user.name}
        </h1>
        <LogoutButton />
      </div>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Company admin dashboard - subscription and reports will live here.
      </p>
      <Link
        href="/company-admin/recruiters"
        className="mt-6 inline-block w-fit rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Manage recruiters
      </Link>
    </div>
  );
}
