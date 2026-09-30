import LoginForm from "./LoginForm";
import PublicPage from "@/components/PublicPage";

export default function LoginPage() {
  return (
    <PublicPage width="sm">
      <h1 className="text-2xl font-semibold text-zinc-900">Log in</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Candidates, recruiters, company admins and platform admins all log in here.
      </p>
      <LoginForm />
    </PublicPage>
  );
}
