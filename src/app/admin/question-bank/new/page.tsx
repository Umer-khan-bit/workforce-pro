import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import QuestionForm from "../QuestionForm";
import { questionToFormValues } from "../formValues";

export default async function NewQuestionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).from;
  const fromId = (Array.isArray(raw) ? raw[0] : raw) || undefined;

  const [jobRoles, languages, previous] = await Promise.all([
    prisma.jobRole.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.language.findMany({ orderBy: { name: "asc" } }),
    fromId ? prisma.question.findUnique({ where: { id: fromId } }) : null,
  ]);
  if (fromId && !previous) notFound();

  return (
    <div>
      <Link href="/admin/question-bank" className="text-sm text-brand-700 underline">
        &larr; Question bank
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900">{previous ? "Add a new version" : "Add question"}</h1>
      <QuestionForm
        initial={previous ? questionToFormValues(previous) : undefined}
        versionOf={previous ? { id: previous.id, label: previous.content.slice(0, 160) } : undefined}
        jobRoles={jobRoles.map((r) => ({ id: r.id, name: r.name }))}
        languages={languages.map((l) => ({ id: l.id, name: l.name, rtl: l.isRtl }))}
      />
    </div>
  );
}
