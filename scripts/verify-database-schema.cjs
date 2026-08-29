require('dotenv').config();
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verifyDatabaseSchema() {
  const sql = fs.readFileSync('project-docs/Database.sql', 'utf8');
  const expected = [...sql.matchAll(/^CREATE TABLE "([^"]+)"/gm)]
    .map((match) => match[1])
    .sort();
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

  console.log(
    JSON.stringify({
      expectedTables: expected.length,
      actualTables: actual.length,
      foreignKeys: foreign_keys,
      missing,
      unexpected,
    }),
  );
  if (missing.length || unexpected.length || expected.length !== actual.length) process.exitCode = 1;
}

verifyDatabaseSchema().finally(() => prisma.$disconnect());
