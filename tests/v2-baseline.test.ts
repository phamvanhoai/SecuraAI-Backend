import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('project-docs/new/database.sql', 'utf8');
const schema = readFileSync('prisma/schema.prisma', 'utf8');
const migration = readFileSync(
  'prisma/migrations/00000000000000_baseline_v2/migration.sql',
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

    expect(sqlTables).toHaveLength(56);
    expect(prismaModels).toHaveLength(58);
    expect(prismaModels).toEqual(expect.arrayContaining(sqlTables));
    expect(prismaModels).toContain('risk_threat_vulnerabilities');
    expect(prismaModels).toContain('risk_vulnerability_controls');
    expect(prismaModels).not.toContain('training_courses');
  });

  it('keeps the deployable baseline identical to the approved SQL', () => {
    expect(migration).toBe(sql);
  });
});
