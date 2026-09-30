export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-1 flex-col px-6 py-16">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Privacy Policy</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Version 1.0 (placeholder)</p>

      <div className="mt-6 flex flex-col gap-4 text-sm text-zinc-700 dark:text-zinc-300">
        <p>
          This is a placeholder privacy policy for Workforce Pro. It will be replaced with the
          final legal text before launch.
        </p>
        <p>
          We collect the information you provide at signup (name, contact details, region, job
          role and salary expectations) and your assessment responses, in order to score your
          tests, match you with relevant job openings, and let recruiters search and shortlist
          candidates.
        </p>
        <p>
          Your test answers are never sold or shared outside this platform. Recruiters can only
          see your scores, quartile ranking and profile details - not your raw answers.
        </p>
      </div>
    </div>
  );
}
