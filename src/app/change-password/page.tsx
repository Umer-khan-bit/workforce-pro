import ChangePasswordForm from "./ChangePasswordForm";
import PublicPage from "@/components/PublicPage";

export default function ChangePasswordPage() {
  return (
    <PublicPage width="sm">
      <h1 className="text-2xl font-semibold text-zinc-900">
        Set a new password
      </h1>
      <p className="mt-1 text-sm text-zinc-600">
        You&apos;re using a temporary password. Choose a new one to continue.
      </p>
      <ChangePasswordForm />
    </PublicPage>
  );
}
