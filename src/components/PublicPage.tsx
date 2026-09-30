import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { getSetting } from "@/lib/settings";

/** Shared frame for logged-out pages: brand header plus a centred column. */
export default async function PublicPage({
  children,
  width = "md",
}: {
  children: React.ReactNode;
  width?: "sm" | "md" | "lg";
}) {
  const max = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg" }[width];
  const brand = await getSetting("branding");

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4">
          <Link href="/">
            <BrandMark name={brand.name} logoDataUrl={brand.logoDataUrl} />
          </Link>
        </div>
      </header>
      <div className="flex flex-1 flex-col items-center px-4 py-10 sm:py-16">
        <div className={`w-full ${max}`}>{children}</div>
      </div>
    </div>
  );
}
