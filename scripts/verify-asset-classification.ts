import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { prisma } from '../src/database/prisma.js';
import { assetsService } from '../src/modules/it-asset-management/assets.service.js';

// Opt-in development database test; creates and cleans up only its own UUID.
async function verifyClassification(): Promise<void> {
  const officer = await prisma.users.findFirst({
    where: { role: 'SECURITY_OFFICER', status: 'ACTIVE' },
    select: { id: true },
  });
  if (!officer) throw new Error('An active development Security Officer is required');
  const id = randomUUID();
  let created = false;
  try {
    await prisma.assets.create({
      data: {
        id,
        asset_code: `TEST-CLASS-${id}`,
        name: 'Temporary classification integration test',
        asset_type: 'SERVER',
        criticality: 'low',
        data_classification: 'public',
        created_by: officer.id,
      },
    });
    created = true;
    assert.equal((await assetsService.get(officer.id, id)).classification, null);
    const input = {
      confidentialityImpact: 1,
      integrityImpact: 1,
      availabilityImpact: 5,
      businessImpact: 2,
      dataClassification: 'public' as const,
    dataClassificationBasis: 'Only approved public information is handled; no sensitive records are stored.',
      rationale: 'An outage stops essential public services and prevents primary operations.',
    };
    const result = await assetsService.classify(officer.id, id, input);
    assert.equal(result.criticality, 'critical');
    assert.equal(result.score, 5);
    const basis = (await assetsService.get(officer.id, id)).classification;
    assert.equal(basis?.availabilityImpact, 5);
    assert.equal(basis?.rationale, input.rationale);
    assert.equal(basis?.methodVersion, 'SECURAAI-ASSET-IMPACT-v1');
    assert.equal(basis?.dataClassificationBasis, input.dataClassificationBasis);
    assert.equal(basis?.dataClassificationMethodVersion, 'SECURAAI-DATA-CLASSIFICATION-v1');
    assert.equal(basis?.assessedBy?.id, officer.id);
    await assetsService.classify(officer.id, id, { ...input, availabilityImpact: 3 });
    const reloaded = await assetsService.get(officer.id, id);
    assert.equal(reloaded.criticality, 'medium');
    assert.equal(reloaded.classification?.availabilityImpact, 3);
    // This script cleans up its test asset and must not create permanent audit records.
    await prisma.assets.update({ where: { id }, data: { status: 'ARCHIVED', archived_at: new Date() } });
    await assert.rejects(assetsService.classify(officer.id, id, input), { code: 'ASSET_ARCHIVED' });
    console.log(
      'PASS: initial state, maximum score, saved basis, reassessment, archived rejection',
    );
  } finally {
    if (created) await prisma.assets.delete({ where: { id } });
    await prisma.$disconnect();
  }
}

if (process.env.RUN_LIVE_ASSET_TESTS !== '1')
  throw new Error('Set RUN_LIVE_ASSET_TESTS=1 only for the development database');
void verifyClassification().catch(() => {
  console.error(
    'Asset classification verification failed; check the development database connection.',
  );
  process.exitCode = 1;
});
