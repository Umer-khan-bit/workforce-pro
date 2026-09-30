import CompanySignupForm from "./CompanySignupForm";

export default function CompanySignupPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Company sign up</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Creates your company and your company admin account. You can add recruiters afterwards.
        </p>
        <CompanySignupForm />
      </div>
    </div>
  );
}
