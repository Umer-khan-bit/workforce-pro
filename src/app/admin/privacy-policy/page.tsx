import { prisma } from "@/lib/prisma";
import PolicyForm from "./PolicyForm";

export default async function PrivacyPolicyAdminPage() {
  const versions = await prisma.policyDocument.findMany({
    where: { kind: "PRIVACY" },
    orderBy: { publishedAt: "desc" },
    select: { id: true, version: true, title: true, isCurrent: true, publishedAt: true },
  });
  const current = await prisma.policyDocument.findFirst({ where: { kind: "PRIVACY", isCurrent: true } });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Privacy policy</h1>
      <p className="mt-1 text-zinc-600">
        Editing means publishing a new version. Every candidate&apos;s consent records the version
        they accepted, so old versions are kept.
      </p>

      <PolicyForm
        initialTitle={current?.title ?? "Privacy Policy"}
        initialBody={current?.body ?? ""}
        suggestedVersion=""
      />

      <h2 className="mt-8 text-lg font-semibold text-zinc-900">Published versions</h2>
      <div className="card mt-3 max-w-3xl overflow-x-auto p-0">
        <table className="w-full min-w-[22rem] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500">
              <th className="px-4 py-3 font-medium">Version</th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Published</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} className="border-b border-zinc-100">
                <td className="px-4 py-2.5 font-medium">{v.version}</td>
                <td className="px-4 py-2.5">{v.title}</td>
                <td className="px-4 py-2.5">{v.publishedAt.toLocaleDateString("en-GB")}</td>
                <td className="px-4 py-2.5">
                  {v.isCurrent ? <span className="badge bg-green-50 text-green-800">Current</span> : <span className="text-zinc-500">Older</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
