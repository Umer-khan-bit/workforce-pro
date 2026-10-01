import type { Question } from "@prisma/client";
import { OPTION_KEYS } from "@/lib/questionBank/schema";
import { EMPTY_FORM, type QuestionFormValues } from "./QuestionForm";

/** Turns a stored question into the values the add/edit form starts with. */
export function questionToFormValues(question: Question): QuestionFormValues {
  const stored = Array.isArray(question.options) ? (question.options as Array<{ key: string; text: string }>) : [];
  const options = { ...EMPTY_FORM.options };
  for (const key of OPTION_KEYS) options[key] = stored.find((o) => o.key === key)?.text ?? "";
  return {
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
}
