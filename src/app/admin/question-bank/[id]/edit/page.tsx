import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import QuestionForm from "../../QuestionForm";
import { questionToFormValues } from "../../formValues";

export default async function EditQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const fromApprovals = (await searchParams).from === "approvals";
  const [question, jobRoles, languages, answeredCount] = await Promise.all([
    prisma.question.findUnique({
      where: { id },
      include: {
        previousVersion: { select: { id: true, content: true } },
        nextVersions: { select: { id: true, content: true } },
      },
    }),
    prisma.jobRole.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.language.findMany({ orderBy: { name: "asc" } }),
    prisma.response.count({ where: { questionId: id } }),
  ]);
  if (!question) notFound();

  const snippet = (text: string) => (text.length > 90 ? `${text.slice(0, 90)}...` : text);

  return (
    <div>
      <Link href={fromApprovals ? "/admin/approvals" : "/admin/question-bank"} className="text-sm text-brand-700 underline">
        &larr; {fromApprovals ? "Approvals" : "Question bank"}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Edit question</h1>

      {(question.previousVersion || question.nextVersions.length > 0) && (
        <ul className="mt-2 flex flex-col gap-1 text-sm text-zinc-700" data-testid="version-links">
          {question.previousVersion && (
            <li>
              This is a newer version of{" "}
              <Link href={`/admin/question-bank/${question.previousVersion.id}/edit`} className="text-brand-700 underline">
                &ldquo;{snippet(question.previousVersion.content)}&rdquo;
              </Link>
              .
            </li>
          )}
          {question.nextVersions.map((next) => (
            <li key={next.id}>
              Replaced by a newer version:{" "}
              <Link href={`/admin/question-bank/${next.id}/edit`} className="text-brand-700 underline">
                &ldquo;{snippet(next.content)}&rdquo;
              </Link>
              .
            </li>
          ))}
        </ul>
      )}

      <QuestionForm
        questionId={question.id}
        initial={questionToFormValues(question)}
        jobRoles={jobRoles.map((r) => ({ id: r.id, name: r.name }))}
        languages={languages.map((l) => ({ id: l.id, name: l.name, rtl: l.isRtl }))}
        returnTo={fromApprovals ? "/admin/approvals" : "/admin/question-bank"}
        reviewNotes={question.reviewNotes}
        answeredCount={answeredCount}
      />
    </div>
  );
}
