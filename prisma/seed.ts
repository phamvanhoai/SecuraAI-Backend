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

async function seedAnomalyDetectionDemo(
  transaction: Prisma.TransactionClient,
): Promise<void> {
  const officer = await transaction.users.findFirst({
    where: { role: "SECURITY_OFFICER", status: "ACTIVE" },
    select: { id: true },
  });
  if (!officer) {
    throw new Error("An active Security Officer is required for the anomaly demo seed");
  }

  const modelId = "00000000-0000-4000-8000-000000000089";
  const model = await transaction.ai_model_versions.upsert({
    where: {
      model_name_version: { model_name: "secura-organizational-behavior", version: "1.0.0" },
    },
    update: {
      parameters: {
        threshold: 0.7,
        weights: { severity: 0.45, rarity: 0.35, offHours: 0.2 },
      },
    },
    create: {
      id: modelId,
      model_name: "secura-organizational-behavior",
      model_type: "BEHAVIORAL_HEURISTIC",
      version: "1.0.0",
      status: "EVALUATED",
      parameters: {
        threshold: 0.7,
        weights: { severity: 0.45, rarity: 0.35, offHours: 0.2 },
      },
    },
  });
  await transaction.ai_model_versions.update({
    where: { id: model.id },
    data: { status: "DEPLOYED", deployed_at: new Date() },
  });

  const sourceId = "00000000-0000-4000-8000-000000000090";
  await transaction.event_sources.upsert({
    where: { id: sourceId },
    update: { status: "ACTIVE" },
    create: {
      id: sourceId,
      name: "SecuraAI demo identity events",
      source_type: "IDENTITY_PROVIDER",
      ingestion_method: "API",
      endpoint: "https://demo.invalid/securaai/events",
      status: "ACTIVE",
      description: "Development-only normalized events for WBS Run Anomaly Detection",
      created_by: officer.id,
    },
  });

  const occurredAt = new Date();
  occurredAt.setUTCHours(2, 0, 0, 0);
  await transaction.normalized_events.createMany({
    data: [
      {
        event_source_id: sourceId,
        external_event_id: "anomaly-demo-critical-login",
        event_family: "AUTHENTICATION",
        event_type: "privileged_login_failure",
        occurred_at: occurredAt,
        severity: "CRITICAL",
        mapping_status: "UNMAPPED",
        source_ip: "203.0.113.89",
        normalized_payload: { demo: true, attempts: 12 },
      },
      {
        event_source_id: sourceId,
        external_event_id: "anomaly-demo-routine-login",
        event_family: "AUTHENTICATION",
        event_type: "routine_login",
        occurred_at: new Date(),
        severity: "LOW",
        mapping_status: "UNMAPPED",
        source_ip: "198.51.100.20",
        normalized_payload: { demo: true, attempts: 1 },
      },
    ],
    skipDuplicates: true,
  });
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

  await prisma.$transaction(
    async (transaction) => {
      for (const user of users) await upsertUser(transaction, user);
      if (process.env.SEED_ANOMALY_DEMO === "true") {
        await seedAnomalyDetectionDemo(transaction);
      }
    },
    { maxWait: 10_000, timeout: 30_000 },
  );

  console.log(`Seeded ${users.length} V2 user account(s).`);
  if (process.env.SEED_ANOMALY_DEMO === "true") {
    console.log("Seeded the anomaly detection demo model and normalized events.");
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
