import 'dotenv/config';
import argon2 from 'argon2';
import { Prisma, PrismaClient } from '@prisma/client';

/** Seed for project-docs/new/database.sql. */
const prisma = new PrismaClient();

type SeedUser = {
  email: string;
  username: string;
  fullName: string;
  role: 'ADMIN' | 'SECURITY_OFFICER' | 'EMPLOYEE' | 'EXECUTIVE';
  password: string;
};

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function optionalUser(prefix: string, role: SeedUser['role']): SeedUser | null {
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

async function upsertUser(transaction: Prisma.TransactionClient, user: SeedUser): Promise<void> {
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

async function seedAnomalyDetectionDemo(transaction: Prisma.TransactionClient): Promise<void> {
  const officer = await transaction.users.findFirst({
    where: { role: 'SECURITY_OFFICER', status: 'ACTIVE' },
    select: { id: true },
  });
  if (!officer) {
    throw new Error('An active Security Officer is required for the anomaly demo seed');
  }

  const modelId = '00000000-0000-4000-8000-000000000089';
  const model = await transaction.ai_model_versions.upsert({
    where: {
      model_name_version: { model_name: 'secura-organizational-behavior', version: '1.0.0' },
    },
    update: {
      parameters: {
        threshold: 0.7,
        weights: { severity: 0.45, rarity: 0.35, offHours: 0.2 },
      },
    },
    create: {
      id: modelId,
      model_name: 'secura-organizational-behavior',
      model_type: 'BEHAVIORAL_HEURISTIC',
      version: '1.0.0',
      status: 'EVALUATED',
      parameters: {
        threshold: 0.7,
        weights: { severity: 0.45, rarity: 0.35, offHours: 0.2 },
      },
    },
  });
  await transaction.ai_model_versions.update({
    where: { id: model.id },
    data: { status: 'DEPLOYED', deployed_at: new Date() },
  });

  const sourceId = '00000000-0000-4000-8000-000000000090';
  await transaction.event_sources.upsert({
    where: { id: sourceId },
    update: { status: 'ACTIVE' },
    create: {
      id: sourceId,
      name: 'SecuraAI demo identity events',
      source_type: 'IDENTITY_PROVIDER',
      ingestion_method: 'API',
      endpoint: 'https://demo.invalid/securaai/events',
      status: 'ACTIVE',
      description: 'Development-only normalized events for WBS Run Anomaly Detection',
      created_by: officer.id,
    },
  });

  const occurredAt = new Date();
  occurredAt.setUTCHours(2, 0, 0, 0);
  await transaction.normalized_events.createMany({
    data: [
      {
        event_source_id: sourceId,
        external_event_id: 'anomaly-demo-critical-login',
        event_family: 'AUTHENTICATION',
        event_type: 'privileged_login_failure',
        occurred_at: occurredAt,
        severity: 'CRITICAL',
        mapping_status: 'UNMAPPED',
        source_ip: '203.0.113.89',
        normalized_payload: { demo: true, attempts: 12 },
      },
      {
        event_source_id: sourceId,
        external_event_id: 'anomaly-demo-routine-login',
        event_family: 'AUTHENTICATION',
        event_type: 'routine_login',
        occurred_at: new Date(),
        severity: 'LOW',
        mapping_status: 'UNMAPPED',
        source_ip: '198.51.100.20',
        normalized_payload: { demo: true, attempts: 1 },
      },
    ],
    skipDuplicates: true,
  });
}

async function seedRiskRegisterDemo(transaction: Prisma.TransactionClient): Promise<void> {
  const officer = await transaction.users.findFirst({
    where: { role: 'SECURITY_OFFICER', status: 'ACTIVE' },
    select: { id: true },
  });
  if (!officer) throw new Error('An active Security Officer is required for the risk demo seed');

  const asset = await transaction.assets.upsert({
    where: { asset_code: 'DEMO-AST-001' },
    update: { status: 'ACTIVE', owner_user_id: officer.id },
    create: {
      id: '00000000-0000-4000-8000-000000000140',
      asset_code: 'DEMO-AST-001',
      name: 'Customer Identity Platform',
      asset_type: 'APPLICATION',
      criticality: 'CRITICAL',
      data_classification: 'CONFIDENTIAL',
      description: 'Demo internet-facing identity service used by the risk register sample.',
      owner_user_id: officer.id,
      created_by: officer.id,
    },
  });
  const control = await transaction.security_controls.upsert({
    where: { control_code: 'DEMO-CTRL-001' },
    update: { implementation_status: 'PARTIALLY_IMPLEMENTED' },
    create: {
      id: '00000000-0000-4000-8000-000000000141',
      control_code: 'DEMO-CTRL-001',
      name: 'Privileged access review',
      description: 'Quarterly review and removal of unnecessary privileged access.',
      owner_user_id: officer.id,
      applicability: 'APPLICABLE',
      implementation_status: 'PARTIALLY_IMPLEMENTED',
      created_by: officer.id,
    },
  });

  const controlEvidence = await transaction.evidence_items.upsert({
    where: { id: '00000000-0000-4000-8000-000000000153' },
    update: {
      status: 'ACTIVE',
      owner_user_id: officer.id,
      reviewed_by: officer.id,
      reviewed_at: new Date('2026-09-30T00:00:00.000Z'),
      valid_until: new Date('2027-09-30T00:00:00.000Z'),
    },
    create: {
      id: '00000000-0000-4000-8000-000000000153',
      name: 'Q3 2026 privileged access review report',
      description:
        'Sample evidence showing the quarterly review of privileged accounts, identified exceptions, and remediation follow-up.',
      source: 'Identity and Access Management team',
      owner_user_id: officer.id,
      storage_uri: 'demo://evidence/q3-2026-privileged-access-review.pdf',
      mime_type: 'application/pdf',
      file_size: 245760n,
      collected_at: new Date('2026-09-29T00:00:00.000Z'),
      valid_from: new Date('2026-09-29T00:00:00.000Z'),
      valid_until: new Date('2027-09-30T00:00:00.000Z'),
      status: 'ACTIVE',
      integrity_hash: 'demo-q3-2026-privileged-access-review',
      reviewed_by: officer.id,
      reviewed_at: new Date('2026-09-30T00:00:00.000Z'),
    },
  });
  await transaction.control_evidence_links.upsert({
    where: {
      control_id_evidence_id: {
        control_id: control.id,
        evidence_id: controlEvidence.id,
      },
    },
    update: { linked_by: officer.id },
    create: {
      control_id: control.id,
      evidence_id: controlEvidence.id,
      linked_by: officer.id,
    },
  });

  const risks = [
    {
      id: '00000000-0000-4000-8000-000000000142',
      code: 'DEMO-RSK-001',
      title: 'Unauthorized privileged access',
      description:
        'Compromised privileged credentials could expose customer identities and administrative functions.',
      status: 'UNDER_TREATMENT' as const,
      rating: 'CRITICAL' as const,
      residual: 'HIGH' as const,
      reviewDate: new Date('2027-01-15T00:00:00.000Z'),
    },
    {
      id: '00000000-0000-4000-8000-000000000143',
      code: 'DEMO-RSK-002',
      title: 'Identity service outage',
      description:
        'Loss of the identity platform could prevent staff and customers from accessing critical services.',
      status: 'OPEN' as const,
      rating: 'HIGH' as const,
      residual: 'MEDIUM' as const,
      reviewDate: new Date('2027-02-10T00:00:00.000Z'),
    },
    {
      id: '00000000-0000-4000-8000-000000000144',
      code: 'DEMO-RSK-003',
      title: 'Excessive retention of authentication logs',
      description:
        'Authentication records may be retained beyond the approved business and regulatory period.',
      status: 'ACCEPTED' as const,
      rating: 'MEDIUM' as const,
      residual: 'LOW' as const,
      reviewDate: new Date('2027-03-20T00:00:00.000Z'),
    },
  ];

  for (const [index, input] of risks.entries()) {
    const risk = await transaction.risks.upsert({
      where: { risk_code: input.code },
      update: {
        title: input.title,
        description: input.description,
        status: input.status,
        owner_user_id: officer.id,
        review_date: input.reviewDate,
      },
      create: {
        id: input.id,
        risk_code: input.code,
        title: input.title,
        description: input.description,
        status: input.status,
        owner_user_id: officer.id,
        review_date: input.reviewDate,
        created_by: officer.id,
      },
    });
    await transaction.risk_assets.upsert({
      where: { risk_id_asset_id: { risk_id: risk.id, asset_id: asset.id } },
      update: {},
      create: { risk_id: risk.id, asset_id: asset.id },
    });
    const assessmentId = `00000000-0000-4000-8000-${String(145 + index).padStart(12, '0')}`;
    await transaction.risk_assessments.upsert({
      where: { id: assessmentId },
      update: {
        inherent_rating: input.rating,
        residual_rating: input.residual,
        review_date: input.reviewDate,
      },
      create: {
        id: assessmentId,
        risk_id: risk.id,
        assessment_type: 'INITIAL',
        inherent_likelihood: 5 - index,
        inherent_impact: 5 - Math.min(index, 1),
        inherent_rating: input.rating,
        control_effectiveness: new Prisma.Decimal(55 + index * 15),
        residual_likelihood: Math.max(1, 4 - index),
        residual_impact: Math.max(1, 4 - index),
        residual_rating: input.residual,
        target_risk: index === 0 ? 'MEDIUM' : 'LOW',
        risk_appetite: 'LOW',
        risk_tolerance: index === 0 ? 'MEDIUM' : 'LOW',
        assessment_reason: 'Demonstration assessment for the V2 risk register.',
        assessed_by: officer.id,
        review_date: input.reviewDate,
      },
    });
  }

  const primaryRiskId = risks[0]!.id;
  await transaction.risk_threats.upsert({
    where: { id: '00000000-0000-4000-8000-000000000148' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000148',
      risk_id: primaryRiskId,
      name: 'Credential theft',
      description: 'Phishing or malware captures privileged credentials.',
    },
  });
  await transaction.risk_vulnerabilities.upsert({
    where: { id: '00000000-0000-4000-8000-000000000149' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000149',
      risk_id: primaryRiskId,
      name: 'Incomplete privileged access review',
      description: 'Dormant administrative access is not removed consistently.',
    },
  });
  await transaction.control_risk_links.upsert({
    where: { control_id_risk_id: { control_id: control.id, risk_id: primaryRiskId } },
    update: {},
    create: { control_id: control.id, risk_id: primaryRiskId },
  });

  const plan = await transaction.risk_treatment_plans.upsert({
    where: { id: '00000000-0000-4000-8000-000000000150' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000150',
      risk_id: primaryRiskId,
      source_assessment_id: '00000000-0000-4000-8000-000000000145',
      title: 'Strengthen privileged access governance',
      strategy: 'MITIGATE',
      status: 'ACTIVE',
      owner_user_id: officer.id,
      target_completion_date: new Date('2027-01-05T00:00:00.000Z'),
      created_by: officer.id,
    },
  });
  await transaction.risk_treatment_actions.upsert({
    where: { id: '00000000-0000-4000-8000-000000000151' },
    update: { status: 'IN_PROGRESS' },
    create: {
      id: '00000000-0000-4000-8000-000000000151',
      treatment_plan_id: plan.id,
      action_description: 'Review all privileged accounts and enforce phishing-resistant MFA.',
      owner_user_id: officer.id,
      status: 'IN_PROGRESS',
      due_date: new Date('2026-12-20T00:00:00.000Z'),
    },
  });
  const incident = await transaction.incidents.upsert({
    where: { incident_code: 'DEMO-INC-001' },
    update: { status: 'TRIAGE' },
    create: {
      id: '00000000-0000-4000-8000-000000000152',
      incident_code: 'DEMO-INC-001',
      title: 'Suspicious privileged sign-in',
      description: 'A privileged account signed in from an unusual location.',
      severity: 'HIGH',
      status: 'TRIAGE',
      handler_user_id: officer.id,
      detected_at: new Date('2026-09-28T02:15:00.000Z'),
      confirmed_at: new Date('2026-09-28T02:30:00.000Z'),
      created_by: officer.id,
    },
  });
  await transaction.incident_risks.upsert({
    where: { incident_id_risk_id: { incident_id: incident.id, risk_id: primaryRiskId } },
    update: {},
    create: { incident_id: incident.id, risk_id: primaryRiskId, linked_by: officer.id },
  });
}

async function main(): Promise<void> {
  const users: SeedUser[] = [
    {
      email: required(process.env.ADMIN_EMAIL, 'ADMIN_EMAIL').toLowerCase(),
      username: process.env.ADMIN_USERNAME?.trim() ?? 'admin',
      fullName: process.env.ADMIN_FULL_NAME?.trim() ?? 'System Administrator',
      role: 'ADMIN',
      password: required(process.env.ADMIN_PASSWORD, 'ADMIN_PASSWORD'),
    },
  ];

  for (const user of [
    optionalUser('SECURITY_OFFICER', 'SECURITY_OFFICER'),
    optionalUser('EMPLOYEE', 'EMPLOYEE'),
    optionalUser('EXECUTIVE', 'EXECUTIVE'),
  ]) {
    if (user) users.push(user);
  }

  await prisma.$transaction(
    async (transaction) => {
      for (const user of users) await upsertUser(transaction, user);
      if (process.env.SEED_ANOMALY_DEMO === 'true') {
        await seedAnomalyDetectionDemo(transaction);
      }
      if (process.env.SEED_RISK_DEMO === 'true') {
        await seedRiskRegisterDemo(transaction);
      }
    },
    { maxWait: 10_000, timeout: 30_000 },
  );

  console.log(`Seeded ${users.length} V2 user account(s).`);
  if (process.env.SEED_ANOMALY_DEMO === 'true') {
    console.log('Seeded the anomaly detection demo model and normalized events.');
  }
  if (process.env.SEED_RISK_DEMO === 'true') {
    console.log('Seeded the V2 risk register demo records.');
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
