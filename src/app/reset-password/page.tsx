import Link from "next/link";
import PublicPage from "@/components/PublicPage";
import ResetPasswordForm from "./ResetPasswordForm";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).token;
  const token = Array.isArray(raw) ? raw[0] : raw;

  return (
    <PublicPage width="sm">
      <h1 className="text-2xl font-semibold text-zinc-900">Choose a new password</h1>
      {token ? (
        <>
          <p className="mt-1 text-sm text-zinc-600">Pick a password of at least 8 characters.</p>
          <ResetPasswordForm token={token} />
        </>
      ) : (
        <p className="mt-4 text-sm text-zinc-700">
          This page needs the link from your email.{" "}
          <Link href="/forgot-password" className="text-brand-700 underline">Ask for a new link</Link>.
        </p>
      )}
    </PublicPage>
  );
}
