import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import NotificationList from "@/components/NotificationList";

const PAGE_SIZE = 50;

/** The in-app notification centre, shared by every role (each user only ever sees their own). */
export default async function NotificationsPage({ intro }: { intro: string }) {
  const session = await auth();
  const rows = await prisma.notification.findMany({
    where: { userId: session!.user.id, channel: "IN_APP" },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
  });
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900">Notifications</h1>
      <p className="mt-1 text-zinc-600">{intro}</p>
      <div className="mt-5">
        <NotificationList rows={rows.map((n) => ({ id: n.id, title: n.title, message: n.message, link: n.link, createdAt: n.createdAt.toISOString(), read: n.readAt !== null }))} />
      </div>
    </div>
  );
}
