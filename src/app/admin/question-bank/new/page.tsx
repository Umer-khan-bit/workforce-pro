import Link from "next/link";
import { prisma } from "@/lib/prisma";
import QuestionForm from "../QuestionForm";

export default async function NewQuestionPage() {
  const [jobRoles, languages] = await Promise.all([
    prisma.jobRole.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.language.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <Link href="/admin/question-bank" className="text-sm text-brand-700 underline">
        &larr; Question bank
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Add question</h1>
      <QuestionForm
        jobRoles={jobRoles.map((r) => ({ id: r.id, name: r.name }))}
        languages={languages.map((l) => ({ id: l.id, name: l.name, rtl: l.isRtl }))}
      />
    </div>
  );
}
