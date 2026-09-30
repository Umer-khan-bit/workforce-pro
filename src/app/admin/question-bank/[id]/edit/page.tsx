import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OPTION_KEYS } from "@/lib/questionBank/schema";
import QuestionForm, { EMPTY_FORM, type QuestionFormValues } from "../../QuestionForm";

export default async function EditQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const fromApprovals = (await searchParams).from === "approvals";
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
    explanation: question.explanation ?? "",
    difficulty: question.difficulty,
    jobRoleId: question.jobRoleId ?? "",
    languageId: question.languageId ?? "",
  };

  return (
    <div>
      <Link href={fromApprovals ? "/admin/approvals" : "/admin/question-bank"} className="text-sm text-brand-700 underline">
        &larr; {fromApprovals ? "Approvals" : "Question bank"}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Edit question</h1>
      <QuestionForm
        questionId={question.id}
        initial={initial}
        jobRoles={jobRoles.map((r) => ({ id: r.id, name: r.name }))}
        languages={languages.map((l) => ({ id: l.id, name: l.name, rtl: l.isRtl }))}
        returnTo={fromApprovals ? "/admin/approvals" : "/admin/question-bank"}
        reviewNotes={question.reviewNotes}
      />
    </div>
  );
}
