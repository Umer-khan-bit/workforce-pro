import PublicPage from "@/components/PublicPage";
import VerifyEmail from "./VerifyEmail";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).token;
  const token = Array.isArray(raw) ? raw[0] : raw;

  return (
    <PublicPage width="sm">
      <h1 className="text-2xl font-semibold text-zinc-900">Confirm your email</h1>
      <VerifyEmail token={token ?? null} />
    </PublicPage>
  );
}
