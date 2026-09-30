"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import BrandMark from "@/components/BrandMark";
import VerifyEmailBanner from "@/components/VerifyEmailBanner";

export type ShellNavGroup = {
  label?: string;
  items: { href: string; label: string }[];
};

export default function AppShell({
  brandName,
  brandLogo,
  roleLabel,
  homeHref,
  groups,
  userName,
  userEmail,
  unverifiedEmail,
  children,
}: {
  brandName: string;
  brandLogo: string | null;
  roleLabel: string;
  homeHref: string;
  groups: ShellNavGroup[];
  userName: string;
  userEmail: string;
  /** The user's email when it has not been confirmed yet; null once it is. */
  unverifiedEmail: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === homeHref ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-dvh lg:flex">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 lg:hidden">
        <Link href={homeHref} className="flex items-baseline gap-2">
          <BrandMark name={brandName} logoDataUrl={brandLogo} />
          <span className="text-xs text-zinc-500">{roleLabel}</span>
        </Link>
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="app-nav"
          onClick={() => setOpen((v) => !v)}
          className="-mr-2 flex size-11 items-center justify-center rounded-lg text-zinc-700 hover:bg-zinc-100"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </header>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-zinc-900/50 lg:hidden"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar on desktop, slide-in drawer on mobile (same element, so one set of links) */}
      <aside
        id="app-nav"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-brand-900 text-white transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:w-64 lg:max-w-none lg:shrink-0 lg:visible lg:translate-x-0 ${
          open ? "translate-x-0" : "invisible -translate-x-full"
        }`}
      >
        <div className="px-5 pb-4 pt-6">
          <Link
            href={homeHref}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 text-lg font-semibold"
          >
            {brandLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brandLogo} alt="" className="h-8 max-w-28 w-auto rounded bg-white object-contain p-1" />
            )}
            <span>{brandName}</span>
          </Link>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-brand-300">
            {roleLabel}
          </p>
        </div>

        <nav aria-label={`${roleLabel} navigation`} className="flex-1 overflow-y-auto px-3 pb-4">
          {groups.map((group, i) => (
            <div key={group.label ?? i} className={i > 0 ? "mt-5" : undefined}>
              {group.label && (
                <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-brand-300">
                  {group.label}
                </p>
              )}
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={isActive(item.href) ? "page" : undefined}
                      className={`flex min-h-11 items-center rounded-lg px-3 text-sm transition-colors ${
                        isActive(item.href)
                          ? "bg-white/15 font-medium text-white"
                          : "text-brand-100 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/15 px-5 py-4">
          <p className="truncate text-sm font-medium">{userName}</p>
          <p className="truncate text-xs text-brand-200">{userEmail}</p>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="mt-3 min-h-11 w-full rounded-lg border border-white/30 px-4 text-sm font-medium hover:bg-white/10"
          >
            Log out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-5xl">
          {unverifiedEmail && <VerifyEmailBanner email={unverifiedEmail} />}
          {children}
        </div>
      </main>
    </div>
  );
}
