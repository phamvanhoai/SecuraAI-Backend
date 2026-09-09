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
  const securityOfficerRole = await prisma.roles.upsert({
    where: { code: 'SECURITY_OFFICER' },
    update: {},
    create: { code: 'SECURITY_OFFICER', name: 'Security Officer', is_system: true },
  });
  const createPolicyPermission = await prisma.permissions.upsert({
    where: { code: 'policies.create' },
    update: {
      module: 'policy-compliance',
      action: 'create',
      description: 'Create information security policy drafts',
    },
    create: {
      code: 'policies.create',
      module: 'policy-compliance',
      action: 'create',
      description: 'Create information security policy drafts',
    },
  });
  const assetReadPermission = await prisma.permissions.upsert({
    where: { code: 'assets.read' },
    update: {
      module: 'asset-management',
      action: 'read',
      description: 'View the asset list',
    },
    create: {
      code: 'assets.read',
      module: 'asset-management',
      action: 'read',
      description: 'View the asset list',
    },
  });
  const assetCreatePermission = await prisma.permissions.upsert({
    where: { code: 'assets.create' },
    update: {
      module: 'asset-management',
      action: 'create',
      description: 'Create an IT asset',
    },
    create: {
      code: 'assets.create',
      module: 'asset-management',
      action: 'create',
      description: 'Create an IT asset',
    },
  });
  const assetUpdatePermission = await prisma.permissions.upsert({
    where: { code: 'assets.update' },
    update: {
      module: 'asset-management',
      action: 'update',
      description: 'Update an IT asset',
    },
    create: {
      code: 'assets.update',
      module: 'asset-management',
      action: 'update',
      description: 'Update an IT asset',
    },
  });
  const assetDeletePermission = await prisma.permissions.upsert({
    where: { code: 'assets.delete' },
    update: {
      module: 'asset-management',
      action: 'delete',
      description: 'Delete an IT asset',
    },
    create: {
      code: 'assets.delete',
      module: 'asset-management',
      action: 'delete',
      description: 'Delete an IT asset',
    },
  });
  const assetClassifyPermission = await prisma.permissions.upsert({
    where: { code: 'assets.classify' },
    update: {
      module: 'asset-management',
      action: 'classify',
      description: 'Classify asset criticality',
    },
    create: {
      code: 'assets.classify',
      module: 'asset-management',
      action: 'classify',
      description: 'Classify asset criticality',
    },
  });
  const assetAssignOwnerPermission = await prisma.permissions.upsert({
    where: { code: 'assets.assign-owner' },
    update: {
      module: 'asset-management',
      action: 'assign-owner',
      description: 'Assign or unassign an asset owner',
    },
    create: {
      code: 'assets.assign-owner',
      module: 'asset-management',
      action: 'assign-owner',
      description: 'Assign or unassign an asset owner',
    },
  });
  const logSourceReadPermission = await prisma.permissions.upsert({
    where: { code: 'log-sources.read' },
    update: {
      module: 'security-monitoring',
      action: 'read',
      description: 'View configured log sources',
    },
    create: {
      code: 'log-sources.read',
      module: 'security-monitoring',
      action: 'read',
      description: 'View configured log sources',
    },
  });
  const logSourceManagePermission = await prisma.permissions.upsert({
    where: { code: 'log-sources.manage' },
    update: {
      module: 'security-monitoring',
      action: 'manage',
      description: 'Configure log sources',
    },
    create: {
      code: 'log-sources.manage',
      module: 'security-monitoring',
      action: 'manage',
      description: 'Configure log sources',
    },
  });
  const securityEventIngestPermission = await prisma.permissions.upsert({
    where: { code: 'security-events.ingest' },
    update: {
      module: 'security-monitoring',
      action: 'ingest',
      description: 'Ingest and normalize security events from configured log sources',
    },
    create: {
      code: 'security-events.ingest',
      module: 'security-monitoring',
      action: 'ingest',
      description: 'Ingest and normalize security events from configured log sources',
    },
  });
  const aiModelReadPermission = await prisma.permissions.upsert({
    where: { code: 'ai-models.read' },
    update: {
      module: 'ai-alerts',
      action: 'read-models',
      description: 'View pre-trained AI model configurations',
    },
    create: {
      code: 'ai-models.read',
      module: 'ai-alerts',
      action: 'read-models',
      description: 'View pre-trained AI model configurations',
    },
  });
  const aiModelManagePermission = await prisma.permissions.upsert({
    where: { code: 'ai-models.manage' },
    update: {
      module: 'ai-alerts',
      action: 'manage-models',
      description: 'Configure pre-trained AI models and detection rules',
    },
    create: {
      code: 'ai-models.manage',
      module: 'ai-alerts',
      action: 'manage-models',
      description: 'Configure pre-trained AI models and detection rules',
    },
  });
  const aiAlertReadPermission = await prisma.permissions.upsert({
    where: { code: 'ai-alerts.read' },
    update: {
      module: 'ai-alerts',
      action: 'read-alerts',
      description: 'View generated AI alerts in near real time',
    },
    create: {
      code: 'ai-alerts.read',
      module: 'ai-alerts',
      action: 'read-alerts',
      description: 'View generated AI alerts in near real time',
    },
  });
  const aiAlertFeedbackPermission = await prisma.permissions.upsert({
    where: { code: 'ai-alerts.feedback' },
    update: {
      module: 'ai-alerts',
      action: 'evaluate-reliability',
      description: 'Evaluate the reliability of generated AI alerts',
    },
    create: {
      code: 'ai-alerts.feedback',
      module: 'ai-alerts',
      action: 'evaluate-reliability',
      description: 'Evaluate the reliability of generated AI alerts',
    },
  });
  const policyPublishPermission = await prisma.permissions.upsert({
    where: { code: 'policies.publish' },
    update: {
      module: 'policy-compliance',
      action: 'publish',
      description: 'Publish official information security policy versions',
    },
    create: {
      code: 'policies.publish',
      module: 'policy-compliance',
      action: 'publish',
      description: 'Publish official information security policy versions',
    },
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
  for (const policyAuthorRole of [role, securityOfficerRole]) {
    await prisma.role_permissions.upsert({
      where: {
        role_id_permission_id: {
          role_id: policyAuthorRole.role_id,
          permission_id: createPolicyPermission.permission_id,
        },
      },
      update: {},
      create: {
        role_id: policyAuthorRole.role_id,
        permission_id: createPolicyPermission.permission_id,
      },
    });
  }
  await prisma.role_permissions.upsert({
    where: {
      role_id_permission_id: {
        role_id: role.role_id,
        permission_id: assetReadPermission.permission_id,
      },
    },
    update: {},
    create: {
      role_id: role.role_id,
      permission_id: assetReadPermission.permission_id,
    },
  });
  await prisma.role_permissions.upsert({
    where: {
      role_id_permission_id: {
        role_id: role.role_id,
        permission_id: assetCreatePermission.permission_id,
      },
    },
    update: {},
    create: {
      role_id: role.role_id,
      permission_id: assetCreatePermission.permission_id,
    },
  });
  await prisma.role_permissions.upsert({
    where: {
      role_id_permission_id: {
        role_id: role.role_id,
        permission_id: assetUpdatePermission.permission_id,
      },
    },
    update: {},
    create: {
      role_id: role.role_id,
      permission_id: assetUpdatePermission.permission_id,
    },
  });
  await prisma.role_permissions.upsert({
    where: {
      role_id_permission_id: {
        role_id: role.role_id,
        permission_id: assetDeletePermission.permission_id,
      },
    },
    update: {},
    create: {
      role_id: role.role_id,
      permission_id: assetDeletePermission.permission_id,
    },
  });
  await prisma.role_permissions.upsert({
    where: {
      role_id_permission_id: {
        role_id: role.role_id,
        permission_id: assetClassifyPermission.permission_id,
      },
    },
    update: {},
    create: {
      role_id: role.role_id,
      permission_id: assetClassifyPermission.permission_id,
    },
  });
  await prisma.role_permissions.upsert({
    where: {
      role_id_permission_id: {
        role_id: role.role_id,
        permission_id: assetAssignOwnerPermission.permission_id,
      },
    },
    update: {},
    create: {
      role_id: role.role_id,
      permission_id: assetAssignOwnerPermission.permission_id,
    },
  });
  for (const permission of [
    logSourceReadPermission,
    logSourceManagePermission,
    securityEventIngestPermission,
    aiModelReadPermission,
    aiModelManagePermission,
    aiAlertReadPermission,
    aiAlertFeedbackPermission,
    policyPublishPermission,
  ]) {
    await prisma.role_permissions.upsert({
      where: {
        role_id_permission_id: {
          role_id: role.role_id,
          permission_id: permission.permission_id,
        },
      },
      update: {},
      create: {
        role_id: role.role_id,
        permission_id: permission.permission_id,
      },
    });
  }
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
