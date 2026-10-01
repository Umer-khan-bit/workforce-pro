import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { changedProfileFields, profileUpdateSchema } from "@/lib/profile";

/** A candidate edits their own profile. Every change is written to the audit log (field names only). */
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "CANDIDATE") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = profileUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, include: { candidateProfile: true } });
  const profile = user?.candidateProfile;
  if (!user?.isActive || !profile || profile.anonymisedAt) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [region, jobRole, city] = await Promise.all([
    prisma.region.findUnique({ where: { id: input.regionId } }),
    prisma.jobRole.findUnique({ where: { id: input.jobRoleId } }),
    prisma.city.findUnique({ where: { id: input.cityId } }),
  ]);
  // A switched-off region or role can still be kept by someone who already has it, but not newly chosen.
  if (!region || (!region.isActive && region.id !== profile.regionId)) {
    return NextResponse.json({ error: "Choose a region from the list" }, { status: 400 });
  }
  if (!jobRole || (!jobRole.isActive && jobRole.id !== profile.jobRoleId)) {
    return NextResponse.json({ error: "Choose a job role from the list" }, { status: 400 });
  }
  if (!city || city.regionId !== region.id || (!city.isActive && city.name !== profile.city)) {
    return NextResponse.json({ error: "Choose a city in the selected region" }, { status: 400 });
  }

  const changed = changedProfileFields(
    { name: user.name, phone: profile.phone, city: profile.city, regionId: profile.regionId, experienceYears: profile.experienceYears, jobRoleId: profile.jobRoleId, minimumSalary: profile.minimumSalary, gender: profile.gender },
    { name: input.name, phone: input.phone, city: city.name, regionId: region.id, experienceYears: input.experienceYears, jobRoleId: jobRole.id, minimumSalary: input.minimumSalary, gender: input.gender ?? null }
  );

  if (changed.length > 0) {
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { name: input.name } }),
      prisma.candidateProfile.update({
        where: { id: profile.id },
        data: {
          phone: input.phone,
          city: city.name,
          regionId: region.id,
          experienceYears: input.experienceYears,
          jobRoleId: jobRole.id,
          minimumSalary: input.minimumSalary,
          gender: input.gender ?? null,
        },
      }),
      prisma.auditLog.create({
        data: { actorId: user.id, action: "CANDIDATE_PROFILE_UPDATED", targetType: "CandidateProfile", targetId: profile.id, metadata: { fields: changed } },
      }),
    ]);
  }

  return NextResponse.json({ ok: true, changed });
}
