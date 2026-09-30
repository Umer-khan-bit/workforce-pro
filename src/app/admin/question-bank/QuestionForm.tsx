"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ALLOWED_QUESTION_TYPES,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  OPTION_KEYS,
  QUESTION_TYPE_LABELS,
  TEST_TYPES,
  TEST_TYPE_LABELS,
  type DifficultyValue,
  type QuestionTypeValue,
  type TestTypeValue,
} from "@/lib/questionBank/schema";

type Option = { id: string; name: string; rtl?: boolean };

export type QuestionFormValues = {
  testType: TestTypeValue;
  type: QuestionTypeValue;
  content: string;
  options: Record<string, string>;
  correctAnswer: string;
  reverseKeyed: boolean;
  topic: string;
  explanation: string;
  difficulty: DifficultyValue;
  jobRoleId: string;
  languageId: string;
};

export const EMPTY_FORM: QuestionFormValues = {
  testType: "IQ",
  type: "MCQ",
  content: "",
  options: { A: "", B: "", C: "", D: "" },
  correctAnswer: "",
  reverseKeyed: false,
  topic: "",
  explanation: "",
  difficulty: "MEDIUM",
  jobRoleId: "",
  languageId: "",
};

export default function QuestionForm({
  questionId,
  initial = EMPTY_FORM,
  jobRoles,
  languages,
  returnTo = "/admin/question-bank",
  reviewNotes,
}: {
  questionId?: string;
  initial?: QuestionFormValues;
  jobRoles: Option[];
  languages: Option[];
  returnTo?: string;
  reviewNotes?: string | null;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const hasOptions = v.type === "MCQ" || v.type === "SITUATIONAL_JUDGEMENT";
  const rtl = languages.find((l) => l.id === v.languageId)?.rtl ?? false;

  function set<K extends keyof QuestionFormValues>(key: K, value: QuestionFormValues[K]) {
    setV((prev) => ({ ...prev, [key]: value }));
  }

  function changeTestType(testType: TestTypeValue) {
    const allowed = ALLOWED_QUESTION_TYPES[testType];
    setV((prev) => ({
      ...prev,
      testType,
      type: allowed.includes(prev.type) ? prev.type : allowed[0],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);

    const payload = {
      testType: v.testType,
      type: v.type,
      content: v.content,
      options: hasOptions ? OPTION_KEYS.map((key) => ({ key, text: v.options[key] ?? "" })) : undefined,
      correctAnswer: hasOptions ? v.correctAnswer : undefined,
      reverseKeyed: v.type === "LIKERT" ? v.reverseKeyed : false,
      topic: v.topic,
      explanation: v.explanation,
      difficulty: v.difficulty,
      jobRoleId: v.testType === "SKILL" ? v.jobRoleId : undefined,
      languageId: v.languageId,
    };

    const res = await fetch(questionId ? `/api/admin/questions/${questionId}` : "/api/admin/questions", {
      method: questionId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    setSubmitting(false);

    if (!res.ok) {
      setFieldErrors(data?.issues?.fieldErrors ?? {});
      setError(data?.error ?? "Something went wrong. Please try again.");
      return;
    }
    router.push(returnTo);
    router.refresh();
  }

  const fieldError = (name: string) =>
    fieldErrors[name]?.[0] ? <p className="mt-1 text-sm text-red-600">{fieldErrors[name][0]}</p> : null;

  return (
    <form onSubmit={handleSubmit} className="card mt-6 flex max-w-3xl flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="testType" className="label">Test</label>
          <select
            id="testType"
            className="input"
            value={v.testType}
            onChange={(e) => changeTestType(e.target.value as TestTypeValue)}
          >
            {TEST_TYPES.map((t) => (
              <option key={t} value={t}>{TEST_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="type" className="label">Question format</label>
          <select
            id="type"
            className="input"
            value={v.type}
            onChange={(e) => set("type", e.target.value as QuestionTypeValue)}
          >
            {ALLOWED_QUESTION_TYPES[v.testType].map((t) => (
              <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>
            ))}
          </select>
          {fieldError("type")}
        </div>
      </div>

      <div>
        <label htmlFor="content" className="label">
          {v.type === "WRITING" ? "Writing prompt" : "Question text"}
        </label>
        <textarea
          id="content"
          dir={rtl ? "rtl" : "ltr"}
          className="input min-h-24"
          value={v.content}
          onChange={(e) => set("content", e.target.value)}
          required
        />
        {fieldError("content")}
      </div>

      {hasOptions && (
        <fieldset>
          <legend className="label">Answer options - select the correct (or best) one</legend>
          <div className="mt-2 flex flex-col gap-2">
            {OPTION_KEYS.map((key) => (
              <div key={key} className="flex items-center gap-3">
                <input
                  type="radio"
                  name="correctAnswer"
                  aria-label={`Option ${key} is correct`}
                  checked={v.correctAnswer === key}
                  onChange={() => set("correctAnswer", key)}
                  className="size-5 accent-brand-700"
                />
                <span className="w-5 text-sm font-medium text-zinc-600">{key}</span>
                <input
                  dir={rtl ? "rtl" : "ltr"}
                  className="input mt-0"
                  aria-label={`Option ${key} text`}
                  value={v.options[key] ?? ""}
                  onChange={(e) => set("options", { ...v.options, [key]: e.target.value })}
                />
              </div>
            ))}
          </div>
          {fieldError("options")}
          {fieldError("correctAnswer")}
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {v.testType === "SKILL" && (
          <div>
            <label htmlFor="jobRoleId" className="label">Job role</label>
            <select
              id="jobRoleId"
              className="input"
              value={v.jobRoleId}
              onChange={(e) => set("jobRoleId", e.target.value)}
            >
              <option value="">Choose a role...</option>
              {jobRoles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            {fieldError("jobRoleId")}
          </div>
        )}
        <div>
          <label htmlFor="languageId" className="label">
            Language{v.testType === "LANGUAGE" ? "" : " (optional)"}
          </label>
          <select
            id="languageId"
            className="input"
            value={v.languageId}
            onChange={(e) => set("languageId", e.target.value)}
          >
            <option value="">{v.testType === "LANGUAGE" ? "Choose a language..." : "Not set"}</option>
            {languages.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          {fieldError("languageId")}
        </div>
        {v.type === "MCQ" && (
          <div>
            <label htmlFor="difficulty" className="label">Difficulty</label>
            <select
              id="difficulty"
              className="input"
              value={v.difficulty}
              onChange={(e) => set("difficulty", e.target.value as DifficultyValue)}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="topic" className="label">
            {v.testType === "PERSONALITY" ? "Trait" : "Topic"} (optional)
          </label>
          <input
            id="topic"
            className="input"
            value={v.topic}
            onChange={(e) => set("topic", e.target.value)}
          />
        </div>
      </div>

      <div>
        <label htmlFor="explanation" className="label">Explanation (optional)</label>
        <textarea
          id="explanation"
          dir={rtl ? "rtl" : "ltr"}
          className="input min-h-20"
          value={v.explanation}
          onChange={(e) => set("explanation", e.target.value)}
        />
        {fieldError("explanation")}
      </div>

      {reviewNotes && (
        <p className="whitespace-pre-line rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          <span className="font-medium">AI review notes:</span> {reviewNotes}
        </p>
      )}

      {v.type === "LIKERT" && (
        <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={v.reverseKeyed}
            onChange={(e) => set("reverseKeyed", e.target.checked)}
            className="size-5 accent-brand-700"
          />
          Reverse-keyed (a high answer means a low score on the trait)
        </label>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Saving..." : questionId ? "Save changes" : "Add question"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => router.push(returnTo)}>
          Cancel
        </button>
        {!questionId && (
          <p className="text-xs text-zinc-500">New questions are approved straight away and record you as the approver.</p>
        )}
      </div>
    </form>
  );
}
