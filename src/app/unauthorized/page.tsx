import Link from "next/link";
import PublicPage from "@/components/PublicPage";

export default function UnauthorizedPage() {
  return (
    <PublicPage>
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">Access denied</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Your account doesn&apos;t have permission to view this page.
        </p>
        <Link href="/" className="btn-primary mt-6">
          Back to home
        </Link>
      </div>
    </PublicPage>
  );
}
