import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { ROLE_NAV, navHref } from "@/lib/navigation";
import AppShell from "@/components/AppShell";

/** Shared layout for the four role areas: sidebar/drawer navigation plus the page. */
export default async function RoleLayout({
  role,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}) {
  const session = await auth();
  const nav = ROLE_NAV[role];

  const groups = nav.groups.map((g) => ({
    label: g.label,
    items: g.items.map((item) => ({ href: navHref(role, item), label: item.label })),
  }));

  return (
    <AppShell
      roleLabel={nav.roleLabel}
      homeHref={nav.base}
      groups={groups}
      userName={session?.user.name ?? nav.roleLabel}
      userEmail={session?.user.email ?? ""}
    >
      {children}
    </AppShell>
  );
}
