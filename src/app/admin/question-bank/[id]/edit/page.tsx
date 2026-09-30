import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OPTION_KEYS } from "@/lib/questionBank/schema";
import QuestionForm, { EMPTY_FORM, type QuestionFormValues } from "../../QuestionForm";

export default async function EditQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [question, jobRoles, languages] = await Promise.all([
    prisma.question.findUnique({ where: { id } }),
    prisma.jobRole.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.language.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!question) notFound();

  const stored = Array.isArray(question.options)
    ? (question.options as Array<{ key: string; text: string }>)
    : [];
  const options = { ...EMPTY_FORM.options };
  for (const key of OPTION_KEYS) options[key] = stored.find((o) => o.key === key)?.text ?? "";

  const initial: QuestionFormValues = {
    testType: question.testType,
    type: question.type,
    content: question.content,
    options,
    correctAnswer: question.correctAnswer ?? "",
    reverseKeyed: question.reverseKeyed,
    topic: question.topic ?? "",
    difficulty: question.difficulty,
    jobRoleId: question.jobRoleId ?? "",
    languageId: question.languageId ?? "",
  };

  return (
    <div>
      <Link href="/admin/question-bank" className="text-sm text-brand-700 underline">
        &larr; Question bank
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Edit question</h1>
      <QuestionForm
        questionId={question.id}
        initial={initial}
        jobRoles={jobRoles.map((r) => ({ id: r.id, name: r.name }))}
        languages={languages.map((l) => ({ id: l.id, name: l.name }))}
      />
    </div>
  );
}
