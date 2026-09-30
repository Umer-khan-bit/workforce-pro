import PublicPage from "@/components/PublicPage";
import ForgotPasswordForm from "./ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <PublicPage width="sm">
      <h1 className="text-2xl font-semibold text-zinc-900">Forgot your password?</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Enter the email address you signed up with and we will send you a link to choose a new password.
      </p>
      <ForgotPasswordForm />
    </PublicPage>
  );
}
