import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { GENERATABLE_TESTS } from "@/lib/ai/prompts";
import GenerateForm from "./GenerateForm";

export default async function GeneratePage() {
  const [jobRoles, languages, ai] = await Promise.all([
    prisma.jobRole.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.language.findMany({ where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
    getSetting("aiGeneration"),
  ]);

  return (
    <div>
      <Link href="/admin/question-bank" className="text-sm text-brand-700 underline">&larr; Question bank</Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Generate questions with AI</h1>
      <p className="mt-1 text-zinc-600">
        Claude ({ai.model}) writes the questions and a second pass ({ai.reviewModel}) reviews them for
        errors, ambiguity and bias. Change models, prompts and batch size under Settings.
      </p>
      <GenerateForm
        tests={[...GENERATABLE_TESTS]}
        jobRoles={jobRoles.map((r) => ({ id: r.id, name: r.name }))}
        languages={languages.map((l) => ({ id: l.id, name: l.name }))}
        batchSize={ai.batchSize}
        maxPerRun={ai.maxQuestionsPerRun}
        keyMissing={!process.env.ANTHROPIC_API_KEY?.trim()}
      />
    </div>
  );
}
