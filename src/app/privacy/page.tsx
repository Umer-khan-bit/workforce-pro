import PublicPage from "@/components/PublicPage";
import { prisma } from "@/lib/prisma";

export default async function PrivacyPolicyPage() {
  const policy = await prisma.policyDocument.findFirst({
    where: { kind: "PRIVACY", isCurrent: true },
  });

  return (
    <PublicPage width="lg">
      <h1 className="text-2xl font-semibold text-zinc-900">{policy?.title ?? "Privacy Policy"}</h1>
      {policy && <p className="mt-1 text-sm text-zinc-500">Version {policy.version}</p>}

      <div className="mt-6 flex flex-col gap-4 text-sm text-zinc-700">
        {policy ? (
          policy.body
            .split(/\n{2,}/)
            .map((paragraph, i) => <p key={i} className="whitespace-pre-line">{paragraph}</p>)
        ) : (
          <p>The privacy policy has not been published yet.</p>
        )}
      </div>
    </PublicPage>
  );
}
