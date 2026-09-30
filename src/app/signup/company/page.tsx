import CompanySignupForm from "./CompanySignupForm";
import PublicPage from "@/components/PublicPage";

export default function CompanySignupPage() {
  return (
    <PublicPage width="lg">
      <h1 className="text-2xl font-semibold text-zinc-900">Company sign up</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Creates your company and your company admin account. You can add recruiters afterwards.
      </p>
      <CompanySignupForm />
    </PublicPage>
  );
}
