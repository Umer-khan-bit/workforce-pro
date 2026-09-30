import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Access denied</h1>
      <p className="mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
        Your account doesn&apos;t have permission to view this page.
      </p>
      <Link href="/" className="mt-6 text-sm font-medium underline">
        Back to home
      </Link>
    </div>
  );
}
