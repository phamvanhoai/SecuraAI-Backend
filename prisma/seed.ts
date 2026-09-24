import "dotenv/config";
import argon2 from "argon2";
import { Prisma, PrismaClient } from "@prisma/client";

/** Seed for project-docs/new/database.sql. */
const prisma = new PrismaClient();

type SeedUser = {
  email: string;
  username: string;
  fullName: string;
  role: "ADMIN" | "SECURITY_OFFICER" | "EMPLOYEE" | "EXECUTIVE";
  password: string;
};

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function optionalUser(
  prefix: string,
  role: SeedUser["role"],
): SeedUser | null {
  const email = process.env[`${prefix}_EMAIL`]?.trim().toLowerCase();
  const password = process.env[`${prefix}_PASSWORD`]?.trim();
  if (!email && !password) return null;
  return {
    email: required(email, `${prefix}_EMAIL`).toLowerCase(),
    username: process.env[`${prefix}_USERNAME`]?.trim() ?? prefix.toLowerCase(),
    fullName: process.env[`${prefix}_FULL_NAME`]?.trim() ?? prefix,
    role,
    password: required(password, `${prefix}_PASSWORD`),
  };
}

async function upsertUser(
  transaction: Prisma.TransactionClient,
  user: SeedUser,
): Promise<void> {
  const passwordHash = await argon2.hash(user.password, {
    type: argon2.argon2id,
  });
  await transaction.$executeRaw(
    Prisma.sql`
      INSERT INTO users (email, username, password_hash, full_name, role, status)
      VALUES (${user.email}, ${user.username}, ${passwordHash}, ${user.fullName},
              ${user.role}::user_role, 'ACTIVE'::user_status)
      ON CONFLICT (email) DO UPDATE SET
        username = EXCLUDED.username,
        password_hash = EXCLUDED.password_hash,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        status = 'ACTIVE'::user_status,
        updated_at = now()
    `,
  );
}

async function main(): Promise<void> {
  const users: SeedUser[] = [
    {
      email: required(process.env.ADMIN_EMAIL, "ADMIN_EMAIL").toLowerCase(),
      username: process.env.ADMIN_USERNAME?.trim() ?? "admin",
      fullName: process.env.ADMIN_FULL_NAME?.trim() ?? "System Administrator",
      role: "ADMIN",
      password: required(process.env.ADMIN_PASSWORD, "ADMIN_PASSWORD"),
    },
  ];

  for (const user of [
    optionalUser("SECURITY_OFFICER", "SECURITY_OFFICER"),
    optionalUser("EMPLOYEE", "EMPLOYEE"),
    optionalUser("EXECUTIVE", "EXECUTIVE"),
  ]) {
    if (user) users.push(user);
  }

  await prisma.$transaction(async (transaction) => {
    for (const user of users) await upsertUser(transaction, user);
  });

  console.log(`Seeded ${users.length} V2 user account(s).`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
