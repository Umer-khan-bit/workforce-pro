import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ROLE_HOME_PATH } from "@/lib/authz";

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    if (session.user.mustChangePassword) redirect("/change-password");
    redirect(ROLE_HOME_PATH[session.user.role]);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-24 dark:bg-black">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Workforce Pro
        </h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          Take assessments, get ranked, get hired. Or find the right candidates faster.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/login"
            className="w-full rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="w-full rounded-md border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Candidate sign up
          </Link>
          <Link
            href="/signup/company"
            className="w-full rounded-md border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Company sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
