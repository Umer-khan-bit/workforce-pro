import LoginForm from "./LoginForm";
import PublicPage from "@/components/PublicPage";

const NOTICES: Record<string, string> = {
  deleted: "Your account has been deleted.",
  reset: "Your password has been changed. Log in with the new one.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).notice;
  const notice = NOTICES[(Array.isArray(raw) ? raw[0] : raw) ?? ""];

  return (
    <PublicPage width="sm">
      <h1 className="text-2xl font-semibold text-zinc-900">Log in</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Candidates, recruiters, company admins and platform admins all log in here.
      </p>
      {notice && (
        <p role="status" className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
        </p>
      )}
      <LoginForm />
    </PublicPage>
  );
}
