import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { candidateSignupSchema } from "@/lib/validation";

const PRIVACY_POLICY_VERSION = "1.0";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = candidateSignupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, email, password, phone, city, regionId, experienceYears, jobRoleId, minimumSalary } =
    parsed.data;

  const [region, jobRole] = await Promise.all([
    prisma.region.findUnique({ where: { id: regionId } }),
    prisma.jobRole.findUnique({ where: { id: jobRoleId } }),
  ]);
  if (!region || !jobRole) {
    return NextResponse.json({ error: "Invalid region or job role" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const hashedPassword = await hashPassword(password);

  await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      role: "CANDIDATE",
      name,
      candidateProfile: {
        create: {
          phone,
          city,
          regionId,
          jobRoleId,
          experienceYears,
          minimumSalary,
          consentGiven: true,
          consentAt: new Date(),
          privacyPolicyVersion: PRIVACY_POLICY_VERSION,
        },
      },
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
