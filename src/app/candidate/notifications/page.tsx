import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import NotificationList from "./NotificationList";

const PAGE_SIZE = 50;

export default async function NotificationsPage() {
  const session = await auth();
  const rows = await prisma.notification.findMany({
    where: { userId: session!.user.id, channel: "IN_APP" },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
  });
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900">Notifications</h1>
      <p className="mt-1 text-zinc-600">Updates about your results, courses and recruiter requests. Important ones are also emailed to you.</p>
      <div className="mt-5">
        <NotificationList
          rows={rows.map((n) => ({ id: n.id, title: n.title, message: n.message, link: n.link, createdAt: n.createdAt.toISOString(), read: n.readAt !== null }))}
        />
      </div>
    </div>
  );
}
