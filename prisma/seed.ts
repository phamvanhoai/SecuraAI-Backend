import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD (minimum 12 characters) are required');
  }

  const role = await prisma.roles.upsert({
    where: { code: 'ADMIN' },
    update: {},
    create: { code: 'ADMIN', name: 'System Administrator', is_system: true },
  });
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await prisma.users.upsert({
    where: { email },
    update: {},
    create: {
      email,
      password_hash: passwordHash,
      full_name: 'SecuraAI Administrator',
    },
  });
  await prisma.user_roles.upsert({
    where: { user_id_role_id: { user_id: user.user_id, role_id: role.role_id } },
    update: {},
    create: { user_id: user.user_id, role_id: role.role_id },
  });
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
