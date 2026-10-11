import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('project-docs/new/database.sql', 'utf8');
const schema = readFileSync('prisma/schema.prisma', 'utf8');
const migration = readFileSync(
  'prisma/migrations/00000000000000_baseline_v2/migration.sql',
  'utf8',
);
const organizationMigration = readFileSync(
  'prisma/migrations/20260929210000_add_user_organization_fields/migration.sql',
  'utf8',
);
const notificationMigration = readFileSync(
  'prisma/migrations/20261008130000_send_in_system_notifications/migration.sql',
  'utf8',
);

describe('V2 database baseline', () => {
  it('keeps every approved baseline table and tracks additive V2 migrations in Prisma', () => {
    const sqlTables = [...sql.matchAll(/^CREATE TABLE\s+([a-z_][a-z0-9_]*)\s*\(/gim)]
      .map((match) => match[1])
      .sort();
    const prismaModels = [...schema.matchAll(/^model\s+([a-z_][a-z0-9_]*)\s*\{/gm)]
      .map((match) => match[1])
      .sort();

    expect(sqlTables).toHaveLength(60);
    expect(prismaModels).toHaveLength(64);
    expect(prismaModels).toEqual(expect.arrayContaining(sqlTables));
    expect(prismaModels).toContain('risk_threat_vulnerabilities');
    expect(prismaModels).toContain('risk_vulnerability_controls');
    expect(prismaModels).toContain('policy_applicabilities');
    expect(prismaModels).toContain('notifications');
    expect(prismaModels).toContain('notification_recipients');
    expect(prismaModels).toContain('notification_deliveries');
    expect(prismaModels).toContain('notification_preferences');
    expect(prismaModels).not.toContain('training_courses');
  });

  it('keeps notification storage in an additive migration', () => {
    expect(notificationMigration).toContain('CREATE TABLE "notifications"');
    expect(notificationMigration).toContain('CREATE TABLE "notification_recipients"');
    expect(notificationMigration).toContain('CREATE TABLE "notification_deliveries"');
    expect(notificationMigration).toContain('CREATE TABLE "notification_preferences"');
    expect(notificationMigration).toContain('uq_notification_recipients_notification_user');
  });

  it('keeps post-baseline organization changes in a separate migration', () => {
    const baselineTables = [
      ...migration.matchAll(/^CREATE TABLE\s+([a-z_][a-z0-9_]*)\s*\(/gim),
    ].map((match) => match[1]);
    expect(baselineTables).toHaveLength(56);
    expect(baselineTables).not.toContain('departments');
    expect(organizationMigration).toContain('CREATE TABLE departments');
    expect(organizationMigration).toContain('ALTER TABLE users');
  });
});
