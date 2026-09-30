import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-24 dark:bg-black">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Log in</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Candidates, recruiters, company admins and platform admins all log in here.
        </p>
        <LoginForm />
      </div>
    </div>
  );
}
