import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.$transaction(async (database) => {
    const roles = await database.roles.findMany({
      where: { code: { in: ['ADMIN', 'SECURITY_OFFICER'] } },
      select: { role_id: true, code: true },
    });
    if (roles.length !== 2) throw new Error('Required system roles are missing');
    const permission = await database.permissions.upsert({
      where: { code: 'login-history.read' },
      update: { module: 'audit-settings', action: 'read', description: 'View login history' },
      create: {
        code: 'login-history.read',
        module: 'audit-settings',
        action: 'read',
        description: 'View login history',
      },
      select: { permission_id: true },
    });
    for (const role of roles) {
      await database.role_permissions.upsert({
        where: {
          role_id_permission_id: { role_id: role.role_id, permission_id: permission.permission_id },
        },
        update: {},
        create: { role_id: role.role_id, permission_id: permission.permission_id },
      });
    }
  });
  console.log('Login history read permission assigned to ADMIN and SECURITY_OFFICER.');
}

main()
  .catch(() => {
    console.error(
      'Unable to provision login history permission. Check database connectivity and required roles.',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
