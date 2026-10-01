import { prisma } from "@/lib/prisma";
import PilotForm from "./PilotForm";

export default async function PilotModePage() {
  const [pilot, companies] = await Promise.all([
    prisma.pilotConfig.findFirst(),
    prisma.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Pilot mode</h1>
      <p className="mt-1 text-zinc-600">
        Restrict the platform to one company while you test it. While it is on, recruiters and company admins of every
        other company cannot log in (an open session ends at the next click), no new company can sign up, and other
        companies&apos; API keys and webhooks stop working. Candidates and platform admins are not affected.
      </p>
      <PilotForm
        initialEnabled={pilot?.enabled ?? false}
        initialCompanyId={pilot?.companyId ?? ""}
        companies={companies}
      />
    </div>
  );
}
