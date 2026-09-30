import { auth } from "@/auth";
import LogoutButton from "@/components/LogoutButton";

export default async function PlatformAdminDashboard() {
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
        Platform admin dashboard - question bank, approvals and platform reports will live here.
      </p>
    </div>
  );
}
