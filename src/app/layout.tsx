import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { brandCss } from "@/lib/settings/brandColor";

// Branding, homepage text, policy, cities and plans all come from the database and change from
// the admin panel, so no page may be frozen at build time.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getSetting("branding");
  return { title: brand.name, description: brand.tagline };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [brand, language] = await Promise.all([
    getSetting("branding"),
    prisma.language.findFirst({ where: { isDefault: true }, select: { code: true } }),
  ]);

  return (
    <html lang={language?.code ?? "en"} className="h-full antialiased">
      <head>
        {/* Brand colour picked in Settings. The value is a validated #rrggbb, so this CSS is safe. */}
        <style dangerouslySetInnerHTML={{ __html: brandCss(brand.primaryColor) }} />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
