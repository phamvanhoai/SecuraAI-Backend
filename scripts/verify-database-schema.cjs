require('dotenv').config();
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verifyDatabaseSchema() {
  const sql = fs.readFileSync('project-docs/new/database.sql', 'utf8');
  const additiveTables = [
    'notification_deliveries',
    'notification_preferences',
    'notification_recipients',
    'notifications',
  ];
  const expected = [
    ...new Set([
      ...[...sql.matchAll(/^CREATE TABLE\s+([a-z_][a-z0-9_]*)\s*\(/gim)].map(
        (match) => match[1],
      ),
      ...additiveTables,
    ]),
  ].sort();
  // The approved baseline remains immutable. These totals include every
  // applied additive migration through Send In-System Notification.
  const expectedForeignKeys = 135;
  const expectedChecks = 184;
  const rows = await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
    ORDER BY table_name
  `;
  const actual = rows.map(({ table_name }) => table_name);
  const missing = expected.filter((table) => !actual.includes(table));
  const unexpected = actual.filter((table) => !expected.includes(table));
  const [{ foreign_keys }] = await prisma.$queryRaw`
    SELECT count(*)::int AS foreign_keys
    FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND constraint_type = 'FOREIGN KEY'
  `;
  const [{ checks }] = await prisma.$queryRaw`
    SELECT count(*)::int AS checks
    FROM pg_constraint
    JOIN pg_namespace ON pg_namespace.oid = pg_constraint.connamespace
    WHERE pg_namespace.nspname = 'public' AND pg_constraint.contype = 'c'
  `;

  console.log(
    JSON.stringify({
      expectedTables: expected.length,
      actualTables: actual.length,
      expectedForeignKeys,
      foreignKeys: foreign_keys,
      expectedChecks,
      checks,
      missing,
      unexpected,
    }),
  );
  if (
    missing.length ||
    unexpected.length ||
    expected.length !== actual.length ||
    foreign_keys !== expectedForeignKeys ||
    checks !== expectedChecks
  ) {
    process.exitCode = 1;
  }
}

verifyDatabaseSchema().finally(() => prisma.$disconnect());
