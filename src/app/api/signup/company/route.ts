import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { companySignupSchema } from "@/lib/validation";
import { signupRateLimitResponse } from "@/lib/signupRateLimit";
import { newCompanySubscription } from "@/lib/trial";
import { inBackground, sendVerificationEmail } from "@/lib/accountEmails";

export async function POST(request: Request) {
  const limited = await signupRateLimitResponse(request, "company");
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const parsed = companySignupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { companyName, industry, cityId, adminName, adminEmail, adminPassword } = parsed.data;

  const city = cityId ? await prisma.city.findUnique({ where: { id: cityId } }) : null;
  if (cityId && !city?.isActive) {
    return NextResponse.json({ error: "Choose a city from the list" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const hashedPassword = await hashPassword(adminPassword);

  // Plan and trial length come from Settings > Accounts & trials.
  const subscription = await newCompanySubscription(prisma);

  const company = await prisma.company.create({
    data: {
      name: companyName,
      industry: industry || null,
      city: city?.name ?? null,
      ...(subscription ? { subscriptions: { create: subscription } } : {}),
      users: {
        create: {
          email: adminEmail,
          password: hashedPassword,
          role: "COMPANY_ADMIN",
          name: adminName,
        },
      },
    },
    include: { users: true },
  });

  inBackground(sendVerificationEmail(prisma, company.users[0]));
  return NextResponse.json({ ok: true }, { status: 201 });
}
