import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrency } from "@/lib/settings";
import ProfileForm from "./ProfileForm";
import DeleteAccount from "./DeleteAccount";
import VerifyEmailBanner from "@/components/VerifyEmailBanner";

export default async function ProfilePage() {
  const session = await auth();
  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    include: { candidateProfile: true },
  });
  const profile = user?.candidateProfile;
  if (!user || !profile || profile.anonymisedAt) redirect("/login");

  const [regions, cities, jobRoles, currency] = await Promise.all([
    prisma.region.findMany({ where: { OR: [{ isActive: true }, { id: profile.regionId ?? "" }] }, orderBy: { name: "asc" } }),
    prisma.city.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.jobRole.findMany({ where: { OR: [{ isActive: true }, { id: profile.jobRoleId ?? "" }] }, orderBy: { name: "asc" } }),
    getCurrency(),
  ]);

  // The form stores a city id, but the profile keeps the city's name: match it back within the region.
  const current = cities.find((c) => c.name === profile.city && c.regionId === profile.regionId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Profile &amp; privacy</h1>
      <p className="mt-1 text-zinc-600">Keep your details up to date. Recruiters see these when you appear in their search.</p>

      <section aria-labelledby="details-h" className="mt-6">
        <h2 id="details-h" className="text-lg font-semibold text-zinc-900">Your details</h2>
        <ProfileForm
          regions={regions.map((r) => ({ id: r.id, name: r.name }))}
          cities={cities.map((c) => ({ id: c.id, name: c.name, regionId: c.regionId }))}
          jobRoles={jobRoles.map((r) => ({ id: r.id, name: r.name }))}
          currencyCode={currency.code}
          initial={{
            name: user.name ?? "",
            phone: profile.phone ?? "",
            regionId: profile.regionId ?? "",
            cityId: current?.id ?? "",
            experienceYears: String(profile.experienceYears ?? 0),
            jobRoleId: profile.jobRoleId ?? "",
            minimumSalary: String(profile.minimumSalary ?? 0),
            gender: profile.gender ?? "",
          }}
        />
      </section>

      <section aria-labelledby="account-h" className="mt-10">
        <h2 id="account-h" className="text-lg font-semibold text-zinc-900">Your account</h2>
        <div className="card mt-3 max-w-2xl text-sm text-zinc-700">
          <p>
            <span className="font-medium">Email:</span> {user.email}{" "}
            {user.emailVerified ? (
              <span className="badge bg-green-50 text-green-800">Confirmed</span>
            ) : (
              <span className="badge bg-amber-50 text-amber-800">Not confirmed</span>
            )}
          </p>
          {!user.emailVerified && (
            <div className="mt-3">
              <VerifyEmailBanner email={user.email} />
            </div>
          )}
          <p className="mt-2">
            <Link href="/change-password" className="text-brand-700 underline">Change your password</Link>
          </p>
        </div>
      </section>

      <section aria-labelledby="privacy-h" className="mt-10">
        <h2 id="privacy-h" className="text-lg font-semibold text-zinc-900">Privacy</h2>
        <div className="card mt-3 max-w-2xl text-sm text-zinc-700">
          <p>
            You accepted the{" "}
            <Link href="/privacy" target="_blank" className="text-brand-700 underline">privacy policy</Link>
            {profile.privacyPolicyVersion ? ` (version ${profile.privacyPolicyVersion})` : ""}
            {profile.consentAt ? ` on ${profile.consentAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}.
          </p>
        </div>
        <DeleteAccount />
      </section>
    </div>
  );
}
