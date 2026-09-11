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

  await prisma.departments.upsert({
    where: { code: 'IT' },
    update: {
      name: 'Phòng Công nghệ thông tin',
      description: 'Phòng ban mẫu phụ trách hạ tầng và tài sản công nghệ thông tin',
      status: 'active',
    },
    create: {
      code: 'IT',
      name: 'Phòng Công nghệ thông tin',
      description: 'Phòng ban mẫu phụ trách hạ tầng và tài sản công nghệ thông tin',
      status: 'active',
    },
  });

  const role = await prisma.roles.upsert({
    where: { code: 'ADMIN' },
    update: {
      name: 'System Administrator',
      description: 'Admin role defined by the approved project use cases',
      is_system: true,
    },
    create: {
      code: 'ADMIN',
      name: 'System Administrator',
      description: 'Admin role defined by the approved project use cases',
      is_system: true,
    },
  });
  const securityOfficerRole = await prisma.roles.upsert({
    where: { code: 'SECURITY_OFFICER' },
    update: {
      name: 'Security Officer',
      description: 'Security Officer role defined by the approved project use cases',
      is_system: false,
    },
    create: {
      code: 'SECURITY_OFFICER',
      name: 'Security Officer',
      description: 'Security Officer role defined by the approved project use cases',
      is_system: false,
    },
  });
  const employeeRole = await prisma.roles.upsert({
    where: { code: 'EMPLOYEE' },
    update: {
      name: 'Employee',
      description: 'Employee role defined by the approved project use cases',
      is_system: false,
    },
    create: {
      code: 'EMPLOYEE',
      name: 'Employee',
      description: 'Employee role defined by the approved project use cases',
      is_system: false,
    },
  });
  const executiveRole = await prisma.roles.upsert({
    where: { code: 'EXECUTIVE' },
    update: {
      name: 'Executive',
      description: 'Executive role defined by the approved project use cases',
      is_system: false,
    },
    create: {
      code: 'EXECUTIVE',
      name: 'Executive',
      description: 'Executive role defined by the approved project use cases',
      is_system: false,
    },
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
  const assetImportPermission = await prisma.permissions.upsert({
    where: { code: 'assets.import' },
    update: {
      module: 'asset-management',
      action: 'import',
      description: 'Import IT assets from Excel',
    },
    create: {
      code: 'assets.import',
      module: 'asset-management',
      action: 'import',
      description: 'Import IT assets from Excel',
    },
  });
  const assetExportPermission = await prisma.permissions.upsert({
    where: { code: 'assets.export' },
    update: {
      module: 'asset-management',
      action: 'export',
      description: 'Export the IT asset list to Excel',
    },
    create: {
      code: 'assets.export',
      module: 'asset-management',
      action: 'export',
      description: 'Export the IT asset list to Excel',
    },
  });
  const assetHistoryReadPermission = await prisma.permissions.upsert({
    where: { code: 'assets.history.read' },
    update: {
      module: 'asset-management',
      action: 'history.read',
      description: 'View asset change history',
    },
    create: {
      code: 'assets.history.read',
      module: 'asset-management',
      action: 'history.read',
      description: 'View asset change history',
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
  const aiAlertConfirmPermission = await prisma.permissions.upsert({
    where: { code: 'ai-alerts.confirm' },
    update: {
      module: 'ai-alerts',
      action: 'confirm-incident',
      description: 'Confirm that an AI alert represents a real security incident',
    },
    create: {
      code: 'ai-alerts.confirm',
      module: 'ai-alerts',
      action: 'confirm-incident',
      description: 'Confirm that an AI alert represents a real security incident',
    },
  });
  const falsePositivePermissionData = {
    code: 'ai-alerts.mark-false-positive',
    module: 'ai-alerts',
    action: 'mark-false-positive',
    description: 'Mark an AI alert as a false positive',
  };
  const falsePositivePermission = await prisma.permissions.upsert({
    where: { code: falsePositivePermissionData.code },
    update: falsePositivePermissionData,
    create: falsePositivePermissionData,
  });
  for (const reviewerRole of [role, securityOfficerRole]) {
    await prisma.role_permissions.upsert({
      where: {
        role_id_permission_id: {
          role_id: reviewerRole.role_id,
          permission_id: falsePositivePermission.permission_id,
        },
      },
      update: {},
      create: {
        role_id: reviewerRole.role_id,
        permission_id: falsePositivePermission.permission_id,
      },
    });
  }
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
  const roleManagementPermissions = await Promise.all(
    (
      [
        ['roles.create', 'create', 'Create custom roles'],
        ['roles.read', 'read', 'View custom roles'],
        ['roles.update', 'update', 'Update custom roles'],
        ['roles.delete', 'delete', 'Delete custom roles'],
        ['users.create', 'create', 'Initialize user accounts'],
        ['users.read', 'read', 'View user accounts'],
      ] as const
    ).map(([code, action, description]) =>
      prisma.permissions.upsert({
        where: { code },
        update: { module: 'access-control', action, description },
        create: { code, module: 'access-control', action, description },
      }),
    ),
  );
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
    {
      code: 'integrations.create',
      module: 'integrations',
      action: 'create',
      description: 'Create third-party SIEM and Firewall integration configurations',
    },
    {
      code: 'integrations.read',
      module: 'integrations',
      action: 'read',
      description: 'View integration configurations and status',
    },
    {
      code: 'integrations.update',
      module: 'integrations',
      action: 'update',
      description: 'Update integration configurations',
    },
    {
      code: 'integrations.connect',
      module: 'integrations',
      action: 'connect',
      description: 'Test external connection to SIEM and Firewall',
    },
  ];

  for (const perm of integrationPermissions) {
    const permission = await prisma.permissions.upsert({
      where: { code: perm.code },
      update: { module: perm.module, action: perm.action, description: perm.description },
      create: perm,
    });
    await prisma.role_permissions.upsert({
      where: {
        role_id_permission_id: { role_id: role.role_id, permission_id: permission.permission_id },
      },
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
  const assetPermissions = [
    assetReadPermission,
    assetCreatePermission,
    assetUpdatePermission,
    assetDeletePermission,
    assetClassifyPermission,
    assetAssignOwnerPermission,
    assetImportPermission,
    assetExportPermission,
    assetHistoryReadPermission,
  ];
  const assetRolePermissions = [
    { targetRole: securityOfficerRole, permissions: assetPermissions },
    { targetRole: employeeRole, permissions: [assetReadPermission] },
    { targetRole: executiveRole, permissions: [assetReadPermission, assetExportPermission] },
    { targetRole: role, permissions: [assetHistoryReadPermission] },
  ];
  await prisma.$transaction([
    prisma.role_permissions.deleteMany({
      where: {
        role_id: {
          in: [
            role.role_id,
            securityOfficerRole.role_id,
            employeeRole.role_id,
            executiveRole.role_id,
          ],
        },
        permission_id: {
          in: assetPermissions.map(({ permission_id }) => permission_id),
        },
      },
    }),
    ...assetRolePermissions.flatMap((mapping) =>
      mapping.permissions.map((permission) =>
        prisma.role_permissions.create({
          data: {
            role_id: mapping.targetRole.role_id,
            permission_id: permission.permission_id,
          },
        }),
      ),
    ),
  ]);
  for (const permission of [
    logSourceReadPermission,
    logSourceManagePermission,
    securityEventIngestPermission,
    aiModelReadPermission,
    aiModelManagePermission,
    aiAlertReadPermission,
    aiAlertFeedbackPermission,
    aiAlertConfirmPermission,
    policyPublishPermission,
    ...roleManagementPermissions,
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
