import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { AUTH_ATTEMPT_LIMIT, AUTH_WINDOW_MS, isRateLimited } from "@/lib/rateLimit";
import { authConfig } from "@/auth.config";
import { syncTokenWithDatabase } from "@/lib/sessionToken";
import { CredentialsSignin } from "next-auth";
import { getPilot, pilotBlocksUser } from "@/lib/pilot";

/** Login refused because of pilot mode (the page shows its own message). */
class PilotModeError extends CredentialsSignin {
  code = "pilot_mode";
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Runs whenever a session is read. The database decides, on every request: a deactivated (or
    // deleted) user is signed out at once, a password reset ends older sessions, and whether a password
    // change is still required (mustChangePassword) always comes from the database, never the browser.
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);
      return syncTokenWithDatabase(token, prisma);
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

        // Only after the password is right, so nobody can probe which companies are in the pilot.
        if (pilotBlocksUser(await getPilot(prisma), { role: user.role, companyId: user.companyId })) throw new PilotModeError();

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
