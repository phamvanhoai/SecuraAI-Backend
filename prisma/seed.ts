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
    update: {
      password_hash: passwordHash,
      status: 'active',
    },
    create: {
      email,
      password_hash: passwordHash,
      full_name: 'SecuraAI Administrator',
      status: 'active',
    },
  });
  const integrationPermissions = [
    { code: 'integrations.create', module: 'integrations', action: 'create', description: 'Create third-party SIEM and Firewall integration configurations' },
    { code: 'integrations.read', module: 'integrations', action: 'read', description: 'View integration configurations and status' },
    { code: 'integrations.update', module: 'integrations', action: 'update', description: 'Update integration configurations' },
    { code: 'integrations.connect', module: 'integrations', action: 'connect', description: 'Test external connection to SIEM and Firewall' },
  ];

  for (const perm of integrationPermissions) {
    const permission = await prisma.permissions.upsert({
      where: { code: perm.code },
      update: { module: perm.module, action: perm.action, description: perm.description },
      create: perm,
    });
    await prisma.role_permissions.upsert({
      where: { role_id_permission_id: { role_id: role.role_id, permission_id: permission.permission_id } },
      update: {},
      create: { role_id: role.role_id, permission_id: permission.permission_id },
    });
  }

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
