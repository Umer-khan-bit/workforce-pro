import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { ROLE_NAV, navHref } from "@/lib/navigation";
import AppShell from "@/components/AppShell";
import { getSetting } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { unreadCount } from "@/lib/notifications";

/** Shared layout for the four role areas: sidebar/drawer navigation plus the page. */
export default async function RoleLayout({
  role,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}) {
  const [session, brand] = await Promise.all([auth(), getSetting("branding")]);
  const nav = ROLE_NAV[role];
  // Platform admins are created by the seed; everyone else must confirm their email address.
  const account =
    role !== "PLATFORM_ADMIN" && session?.user.id
      ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { emailVerified: true, email: true } })
      : null;

  // Candidates have an in-app notification centre; show how many are unread beside it.
  const unread = role === "CANDIDATE" && session?.user.id ? await unreadCount(prisma, session.user.id) : 0;

  const groups = nav.groups.map((g) => ({
    label: g.label,
    items: g.items.map((item) => ({
      href: navHref(role, item),
      label: item.label,
      count: role === "CANDIDATE" && item.slug === "notifications" ? unread : undefined,
    })),
  }));

  return (
    <AppShell
      brandName={brand.name}
      brandLogo={brand.logoDataUrl}
      roleLabel={nav.roleLabel}
      homeHref={nav.base}
      groups={groups}
      userName={session?.user.name ?? nav.roleLabel}
      userEmail={session?.user.email ?? ""}
      unverifiedEmail={account && !account.emailVerified ? account.email : null}
    >
      {children}
    </AppShell>
  );
}
