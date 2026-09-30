import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { AUTH_ATTEMPT_LIMIT, AUTH_WINDOW_MS, isRateLimited } from "@/lib/rateLimit";
import { authConfig } from "@/auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Runs whenever a session is read. Returning null ends the session, so a
    // deactivated (or deleted) user is signed out on their very next request
    // instead of keeping the JWT they already hold until it expires.
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);
      if (!token?.sub) return token;
      const user = await prisma.user.findUnique({
        where: { id: token.sub },
        select: { isActive: true, passwordChangedAt: true },
      });
      if (!user?.isActive) return null;
      // A password reset ends every session that was opened before it. Compared in whole seconds
      // (the token's issue time has no milliseconds), so signing in right after a reset still works.
      if (
        user.passwordChangedAt &&
        typeof token.iat === "number" &&
        token.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)
      ) {
        return null;
      }
      return token;
    },
  },
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        if (await isRateLimited(`login:${email.toLowerCase()}`, AUTH_ATTEMPT_LIMIT, AUTH_WINDOW_MS)) {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
        if (!user || !user.isActive) return null;

        const valid = await verifyPassword(password, user.password);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          companyId: user.companyId,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
});
