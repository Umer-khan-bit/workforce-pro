import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { companySignupSchema } from "@/lib/validation";
import { signupRateLimitResponse } from "@/lib/signupRateLimit";

export async function POST(request: Request) {
  const limited = signupRateLimitResponse(request, "company");
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const parsed = companySignupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { companyName, industry, city, adminName, adminEmail, adminPassword } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const hashedPassword = await hashPassword(adminPassword);

  await prisma.company.create({
    data: {
      name: companyName,
      industry: industry || null,
      city: city || null,
      users: {
        create: {
          email: adminEmail,
          password: hashedPassword,
          role: "COMPANY_ADMIN",
          name: adminName,
        },
      },
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
