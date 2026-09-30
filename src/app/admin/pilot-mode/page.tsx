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
        Restrict the platform to one company or team while you test it. The setting is saved here;
        enforcing it across signup and search is part of the security pass.
      </p>
      <PilotForm
        initialEnabled={pilot?.enabled ?? false}
        initialCompanyId={pilot?.companyId ?? ""}
        companies={companies}
      />
    </div>
  );
}
