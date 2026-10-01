import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { candidateSignupSchema } from "@/lib/validation";
import { signupRateLimitResponse } from "@/lib/signupRateLimit";
import { inBackground, sendVerificationEmail } from "@/lib/accountEmails";

export async function POST(request: Request) {
  const limited = await signupRateLimitResponse(request, "candidate");
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const parsed = candidateSignupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, email, password, phone, cityId, regionId, experienceYears, jobRoleId, minimumSalary, gender } =
    parsed.data;

  const [region, jobRole, city, policy] = await Promise.all([
    prisma.region.findUnique({ where: { id: regionId } }),
    prisma.jobRole.findUnique({ where: { id: jobRoleId } }),
    prisma.city.findUnique({ where: { id: cityId } }),
    prisma.policyDocument.findFirst({ where: { kind: "PRIVACY", isCurrent: true } }),
  ]);
  if (!region?.isActive || !jobRole?.isActive) {
    return NextResponse.json({ error: "Invalid region or job role" }, { status: 400 });
  }
  if (!city?.isActive || city.regionId !== region.id) {
    return NextResponse.json({ error: "Choose a city in the selected region" }, { status: 400 });
  }
  if (!policy) {
    // Consent has to point at a published policy version.
    return NextResponse.json({ error: "Signup is unavailable right now" }, { status: 503 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const hashedPassword = await hashPassword(password);

  const created = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      role: "CANDIDATE",
      name,
      candidateProfile: {
        create: {
          phone,
          city: city.name,
          regionId,
          jobRoleId,
          experienceYears,
          minimumSalary,
          gender: gender ?? null,
          consentGiven: true,
          consentAt: new Date(),
          privacyPolicyVersion: policy.version,
        },
      },
    },
  });

  inBackground(sendVerificationEmail(prisma, created));
  return NextResponse.json({ ok: true }, { status: 201 });
}
