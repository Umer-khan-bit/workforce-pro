import { prisma } from "@/lib/prisma";
import TemplatesManager from "./TemplatesManager";

export default async function MessageTemplatesPage() {
  const templates = await prisma.messageTemplate.findMany({ orderBy: [{ channel: "asc" }, { name: "asc" }] });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Message templates</h1>
      <p className="mt-1 text-zinc-600">
        The wording of emails and in-app alerts. Sending is switched on with the notifications
        module; the wording you save here is what will be used.
      </p>
      <TemplatesManager
        templates={templates.map((t) => ({
          key: t.key,
          name: t.name,
          description: t.description,
          channel: t.channel,
          variables: t.variables as string[],
          subject: t.subject,
          body: t.body,
          isActive: t.isActive,
        }))}
      />
    </div>
  );
}
