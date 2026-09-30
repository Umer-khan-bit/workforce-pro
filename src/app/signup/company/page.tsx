import CompanySignupForm from "./CompanySignupForm";
import PublicPage from "@/components/PublicPage";
import { prisma } from "@/lib/prisma";

export default async function CompanySignupPage() {
  const cities = await prisma.city.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }],
    include: { region: { select: { name: true } } },
  });

  return (
    <PublicPage width="lg">
      <h1 className="text-2xl font-semibold text-zinc-900">Company sign up</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Creates your company and your company admin account. You can add recruiters afterwards.
      </p>
      <CompanySignupForm cities={cities.map((c) => ({ id: c.id, name: `${c.name} (${c.region.name})` }))} />
    </PublicPage>
  );
}
