import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: Role;
    companyId: string | null;
    mustChangePassword: boolean;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      companyId: string | null;
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role;
    companyId: string | null;
    mustChangePassword: boolean;
  }
}
