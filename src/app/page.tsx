import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ROLE_HOME_PATH } from "@/lib/authz";
import PublicPage from "@/components/PublicPage";

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    if (session.user.mustChangePassword) redirect("/change-password");
    redirect(ROLE_HOME_PATH[session.user.role]);
  }

  return (
    <PublicPage>
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Workforce Pro</h1>
        <p className="mt-3 text-zinc-600">
          Take assessments, get ranked, get hired. Or find the right candidates faster.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link href="/login" className="btn-primary w-full">
            Log in
          </Link>
          <Link href="/signup" className="btn-secondary w-full">
            Candidate sign up
          </Link>
          <Link href="/signup/company" className="btn-secondary w-full">
            Company sign up
          </Link>
        </div>
      </div>
    </PublicPage>
  );
}
