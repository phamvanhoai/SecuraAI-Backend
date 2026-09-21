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
  for (const permissionData of [
    {
      code: 'training-courses.read',
      module: 'training-awareness',
      action: 'read-courses',
      description: 'View security awareness courses',
    },
    {
      code: 'training-courses.create',
      module: 'training-awareness',
      action: 'create-course',
      description: 'Create security awareness course drafts',
    },
    {
      code: 'training-courses.assign',
      module: 'training-awareness',
      action: 'assign-course',
      description: 'Assign training courses to users and departments',
    },
    {
      code: 'training-courses.update',
      module: 'training-awareness',
      action: 'update-course-draft',
      description: 'Edit security awareness course drafts',
    },
    {
      code: 'training-courses.duplicate',
      module: 'training-awareness',
      action: 'duplicate-course',
      description: 'Duplicate security awareness courses as new drafts (UC166)',
    },
  ]) {
    const permission = await prisma.permissions.upsert({
      where: { code: permissionData.code },
      update: permissionData,
      create: permissionData,
    });
    await prisma.role_permissions.upsert({
      where: {
        role_id_permission_id: {
          role_id: securityOfficerRole.role_id,
          permission_id: permission.permission_id,
        },
      },
      update: {},
      create: { role_id: securityOfficerRole.role_id, permission_id: permission.permission_id },
    });
  }
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
  const takeTrainingAssessmentPermission = await prisma.permissions.upsert({
    where: { code: 'training-assessments.take' },
    update: {
      module: 'training-awareness',
      action: 'take-assessment',
      description: 'Take assigned post-training assessments',
    },
    create: {
      code: 'training-assessments.take',
      module: 'training-awareness',
      action: 'take-assessment',
      description: 'Take assigned post-training assessments',
    },
  });
  const readOwnCertificatesPermission = await prisma.permissions.upsert({
    where: { code: 'training-certificates.read-own' },
    update: {
      module: 'training-awareness',
      action: 'read-own-certificates',
      description: 'View certificates issued for the signed-in user (UC165)',
    },
    create: {
      code: 'training-certificates.read-own',
      module: 'training-awareness',
      action: 'read-own-certificates',
      description: 'View certificates issued for the signed-in user (UC165)',
    },
  });
  for (const targetRole of [role, employeeRole]) {
    await prisma.role_permissions.upsert({
      where: {
        role_id_permission_id: {
          role_id: targetRole.role_id,
          permission_id: readOwnCertificatesPermission.permission_id,
        },
      },
      update: {},
      create: {
        role_id: targetRole.role_id,
        permission_id: readOwnCertificatesPermission.permission_id,
      },
    });
  }
  await prisma.role_permissions.upsert({
    where: {
      role_id_permission_id: {
        role_id: employeeRole.role_id,
        permission_id: takeTrainingAssessmentPermission.permission_id,
      },
    },
    update: {},
    create: {
      role_id: employeeRole.role_id,
      permission_id: takeTrainingAssessmentPermission.permission_id,
    },
  });
  const assignIncidentPermission = await prisma.permissions.upsert({
    where: { code: 'incidents.assign' },
    update: {
      module: 'incident-management',
      action: 'assign',
      description: 'Assign an active security officer to an incident',
    },
    create: {
      code: 'incidents.assign',
      module: 'incident-management',
      action: 'assign',
      description: 'Assign an active security officer to an incident',
    },
  });
  await prisma.role_permissions.upsert({
    where: {
      role_id_permission_id: {
        role_id: securityOfficerRole.role_id,
        permission_id: assignIncidentPermission.permission_id,
      },
    },
    update: {},
    create: {
      role_id: securityOfficerRole.role_id,
      permission_id: assignIncidentPermission.permission_id,
    },
  });
  const updateIncidentProgressPermission = await prisma.permissions.upsert({
    where: { code: 'incidents.update-progress' },
    update: {
      module: 'incident-management',
      action: 'update-progress',
      description: 'Update incident handling progress and workflow status',
    },
    create: {
      code: 'incidents.update-progress',
      module: 'incident-management',
      action: 'update-progress',
      description: 'Update incident handling progress and workflow status',
    },
  });
  await prisma.role_permissions.upsert({
    where: {
      role_id_permission_id: {
        role_id: securityOfficerRole.role_id,
        permission_id: updateIncidentProgressPermission.permission_id,
      },
    },
    update: {},
    create: {
      role_id: securityOfficerRole.role_id,
      permission_id: updateIncidentProgressPermission.permission_id,
    },
  });
  const incidentEvidencePermission = await prisma.permissions.upsert({
    where: { code: 'incidents.evidence.manage' },
    update: {
      module: 'incident-management',
      action: 'manage-evidence',
      description: 'Attach, list and download incident evidence and logs',
    },
    create: {
      code: 'incidents.evidence.manage',
      module: 'incident-management',
      action: 'manage-evidence',
      description: 'Attach, list and download incident evidence and logs',
    },
  });
  await prisma.role_permissions.upsert({
    where: {
      role_id_permission_id: {
        role_id: securityOfficerRole.role_id,
        permission_id: incidentEvidencePermission.permission_id,
      },
    },
    update: {},
    create: {
      role_id: securityOfficerRole.role_id,
      permission_id: incidentEvidencePermission.permission_id,
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
  const issueTrainingCertificatePermission = await prisma.permissions.upsert({
    where: { code: 'training-certificates.issue' },
    update: {},
    create: {
      code: 'training-certificates.issue',
      module: 'training-awareness',
      action: 'issue-certificate',
      description: 'Issue certificates for completed training with a passed assessment',
    },
  });
  for (const targetRole of [role, securityOfficerRole]) {
    await prisma.role_permissions.upsert({
      where: {
        role_id_permission_id: {
          role_id: targetRole.role_id,
          permission_id: issueTrainingCertificatePermission.permission_id,
        },
      },
      update: {},
      create: {
        role_id: targetRole.role_id,
        permission_id: issueTrainingCertificatePermission.permission_id,
      },
    });
  }
  const trainingCompletionReadPermission = await prisma.permissions.upsert({
    where: { code: 'training-completion.read' },
    update: {
      module: 'training-awareness',
      action: 'read-completion',
      description: 'View training campaign and employee completion progress',
    },
    create: {
      code: 'training-completion.read',
      module: 'training-awareness',
      action: 'read-completion',
      description: 'View training campaign and employee completion progress',
    },
  });
  for (const targetRole of [role, securityOfficerRole, executiveRole]) {
    await prisma.role_permissions.upsert({
      where: {
        role_id_permission_id: {
          role_id: targetRole.role_id,
          permission_id: trainingCompletionReadPermission.permission_id,
        },
      },
      update: {},
      create: {
        role_id: targetRole.role_id,
        permission_id: trainingCompletionReadPermission.permission_id,
      },
    });
  }
  const departmentReportPermission = await prisma.permissions.upsert({
    where: { code: 'training-department-reports.read' },
    update: {},
    create: {
      code: 'training-department-reports.read',
      module: 'training-awareness',
      action: 'read-department-report',
      description: 'View department training completion reports (UC81)',
    },
  });
  for (const targetRole of [role, executiveRole]) {
    await prisma.role_permissions.upsert({
      where: {
        role_id_permission_id: {
          role_id: targetRole.role_id,
          permission_id: departmentReportPermission.permission_id,
        },
      },
      update: {},
      create: {
        role_id: targetRole.role_id,
        permission_id: departmentReportPermission.permission_id,
      },
    });
  }
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
  const updatePolicyPermission = await prisma.permissions.upsert({
    where: { code: 'policies.update' },
    update: {
      module: 'policy-compliance',
      action: 'update',
      description: 'Update published policies and create new draft versions',
    },
    create: {
      code: 'policies.update',
      module: 'policy-compliance',
      action: 'update',
      description: 'Update published policies and create new draft versions',
    },
  });
  const assignPolicyDepartmentPermission = await prisma.permissions.upsert({
    where: { code: 'policies.assign-department' },
    update: {
      module: 'policy-compliance',
      action: 'assign-department',
      description: 'Assign published policies to departments or units',
    },
    create: {
      code: 'policies.assign-department',
      module: 'policy-compliance',
      action: 'assign-department',
      description: 'Assign published policies to departments or units',
    },
  });
  const mapControlsPermission = await prisma.permissions.upsert({
    where: { code: 'compliance.map-controls' },
    update: {
      module: 'policy-compliance',
      action: 'map-controls',
      description: 'Map published policy versions to standard framework controls',
    },
    create: {
      code: 'compliance.map-controls',
      module: 'policy-compliance',
      action: 'map-controls',
      description: 'Map published policy versions to standard framework controls',
    },
  });
  const frameworkSeeds = [
    {
      code: 'ISO27001',
      name: 'ISO/IEC 27001',
      version: '2022',
      description: 'Information security management systems requirements',
      controls: [
        ['A.5.1', 'Policies for information security'],
        ['A.5.15', 'Access control'],
        ['A.5.24', 'Information security incident management planning and preparation'],
        ['A.6.3', 'Information security awareness, education and training'],
        ['A.8.8', 'Management of technical vulnerabilities'],
        ['A.8.15', 'Logging'],
      ],
    },
    {
      code: 'NIST-CSF',
      name: 'NIST Cybersecurity Framework',
      version: '2.0',
      description: 'Cybersecurity risk management framework',
      controls: [
        ['GV.PO-01', 'Policy for managing cybersecurity risks'],
        ['ID.AM-01', 'Inventories of hardware managed by the organization'],
        ['PR.AA-01', 'Identities and credentials for authorized users and services'],
        ['PR.AT-01', 'Personnel cybersecurity awareness and training'],
        ['DE.CM-01', 'Networks and network services are monitored'],
        ['RS.MA-01', 'The incident response plan is executed'],
      ],
    },
  ] as const;
  for (const frameworkSeed of frameworkSeeds) {
    const framework = await prisma.compliance_frameworks.upsert({
      where: {
        code_version: { code: frameworkSeed.code, version: frameworkSeed.version },
      },
      update: {
        name: frameworkSeed.name,
        description: frameworkSeed.description,
      },
      create: {
        code: frameworkSeed.code,
        name: frameworkSeed.name,
        version: frameworkSeed.version,
        description: frameworkSeed.description,
      },
    });
    for (const [controlCode, title] of frameworkSeed.controls) {
      await prisma.compliance_controls.upsert({
        where: {
          compliance_framework_id_control_code: {
            compliance_framework_id: framework.compliance_framework_id,
            control_code: controlCode,
          },
        },
        update: { title },
        create: {
          compliance_framework_id: framework.compliance_framework_id,
          control_code: controlCode,
          title,
        },
      });
    }
  }
  const acknowledgePolicyPermission = await prisma.permissions.upsert({
    where: { code: 'policies.acknowledge' },
    update: {
      module: 'policy-compliance',
      action: 'acknowledge',
      description: 'Confirm reading and understanding of applicable policies',
    },
    create: {
      code: 'policies.acknowledge',
      module: 'policy-compliance',
      action: 'acknowledge',
      description: 'Confirm reading and understanding of applicable policies',
    },
  });
  const reportIncidentPermission = await prisma.permissions.upsert({
    where: { code: 'incidents.report' },
    update: {
      module: 'incident-management',
      action: 'report',
      description: 'Report a new information security incident',
    },
    create: {
      code: 'incidents.report',
      module: 'incident-management',
      action: 'report',
      description: 'Report a new information security incident',
    },
  });
  for (const targetRole of [securityOfficerRole, employeeRole]) {
    await prisma.role_permissions.upsert({
      where: {
        role_id_permission_id: {
          role_id: targetRole.role_id,
          permission_id: reportIncidentPermission.permission_id,
        },
      },
      update: {},
      create: {
        role_id: targetRole.role_id,
        permission_id: reportIncidentPermission.permission_id,
      },
    });
  }
  const classifyIncidentPermission = await prisma.permissions.upsert({
    where: { code: 'incidents.classify' },
    update: {
      module: 'incident-management',
      action: 'classify',
      description: 'Classify the severity of reported information security incidents',
    },
    create: {
      code: 'incidents.classify',
      module: 'incident-management',
      action: 'classify',
      description: 'Classify the severity of reported information security incidents',
    },
  });
  await prisma.role_permissions.upsert({
    where: {
      role_id_permission_id: {
        role_id: securityOfficerRole.role_id,
        permission_id: classifyIncidentPermission.permission_id,
      },
    },
    update: {},
    create: {
      role_id: securityOfficerRole.role_id,
      permission_id: classifyIncidentPermission.permission_id,
    },
  });
  const assessControlsPermission = await prisma.permissions.upsert({
    where: { code: 'compliance.assess-controls' },
    update: {
      module: 'policy-compliance',
      action: 'assess-controls',
      description: 'Assess the compliance level of individual security controls',
    },
    create: {
      code: 'compliance.assess-controls',
      module: 'policy-compliance',
      action: 'assess-controls',
      description: 'Assess the compliance level of individual security controls',
    },
  });
  await prisma.role_permissions.upsert({
    where: {
      role_id_permission_id: {
        role_id: securityOfficerRole.role_id,
        permission_id: assessControlsPermission.permission_id,
      },
    },
    update: {},
    create: {
      role_id: securityOfficerRole.role_id,
      permission_id: assessControlsPermission.permission_id,
    },
  });
  const uploadComplianceEvidencePermission = await prisma.permissions.upsert({
    where: { code: 'compliance.evidence.upload' },
    update: {
      module: 'policy-compliance',
      action: 'upload-evidence',
      description: 'Upload compliance evidence for accessible control assessments',
    },
    create: {
      code: 'compliance.evidence.upload',
      module: 'policy-compliance',
      action: 'upload-evidence',
      description: 'Upload compliance evidence for accessible control assessments',
    },
  });
  for (const targetRole of [securityOfficerRole, employeeRole]) {
    await prisma.role_permissions.upsert({
      where: {
        role_id_permission_id: {
          role_id: targetRole.role_id,
          permission_id: uploadComplianceEvidencePermission.permission_id,
        },
      },
      update: {},
      create: {
        role_id: targetRole.role_id,
        permission_id: uploadComplianceEvidencePermission.permission_id,
      },
    });
  }
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
  const riskReadPermission = await prisma.permissions.upsert({
    where: { code: 'risks.read' },
    update: { module: 'risk-management', action: 'read', description: 'View risk assessments' },
    create: {
      code: 'risks.read',
      module: 'risk-management',
      action: 'read',
      description: 'View risk assessments',
    },
  });
  const riskCreatePermission = await prisma.permissions.upsert({
    where: { code: 'risks.create' },
    update: {
      module: 'risk-management',
      action: 'create',
      description: 'Create risk assessment drafts',
    },
    create: {
      code: 'risks.create',
      module: 'risk-management',
      action: 'create',
      description: 'Create risk assessment drafts',
    },
  });
  const riskUpdatePermission = await prisma.permissions.upsert({
    where: { code: 'risks.update' },
    update: {
      module: 'risk-management',
      action: 'update',
      description: 'Update draft or rejected risk assessments',
    },
    create: {
      code: 'risks.update',
      module: 'risk-management',
      action: 'update',
      description: 'Update draft or rejected risk assessments',
    },
  });
  const riskCancelPermission = await prisma.permissions.upsert({
    where: { code: 'risks.cancel' },
    update: {
      module: 'risk-management',
      action: 'cancel',
      description: 'Cancel draft or rejected risk assessments',
    },
    create: {
      code: 'risks.cancel',
      module: 'risk-management',
      action: 'cancel',
      description: 'Cancel draft or rejected risk assessments',
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
  const aiAlertThresholdManagePermission = await prisma.permissions.upsert({
    where: { code: 'ai-alerts.thresholds.manage' },
    update: {
      module: 'ai-alerts',
      action: 'manage-thresholds',
      description: 'Set custom AI alert thresholds for assets',
    },
    create: {
      code: 'ai-alerts.thresholds.manage',
      module: 'ai-alerts',
      action: 'manage-thresholds',
      description: 'Set custom AI alert thresholds for assets',
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
        ['users.lock', 'lock', 'Lock active user accounts'],
        ['users.unlock', 'unlock', 'Unlock locked user accounts'],
        ['mfa-recovery.manage', 'manage-mfa-recovery', 'Review and decide MFA recovery requests'],
      ] as const
    ).map(([code, action, description]) =>
      prisma.permissions.upsert({
        where: { code },
        update: {
          module: code === 'users.lock' || code === 'users.unlock' ? 'users' : 'access-control',
          action,
          description,
        },
        create: {
          code,
          module: code === 'users.lock' || code === 'users.unlock' ? 'users' : 'access-control',
          action,
          description,
        },
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
  const loginHistoryPermission = await prisma.permissions.upsert({
    where: { code: 'login-history.read' },
    update: { module: 'audit-settings', action: 'read', description: 'View login history' },
    create: {
      code: 'login-history.read',
      module: 'audit-settings',
      action: 'read',
      description: 'View login history',
    },
  });
  for (const historyRole of [role, securityOfficerRole]) {
    await prisma.role_permissions.upsert({
      where: {
        role_id_permission_id: {
          role_id: historyRole.role_id,
          permission_id: loginHistoryPermission.permission_id,
        },
      },
      update: {},
      create: { role_id: historyRole.role_id, permission_id: loginHistoryPermission.permission_id },
    });
  }
  await prisma.$transaction([
    prisma.role_permissions.deleteMany({
      where: {
        role_id: role.role_id,
        permission_id: createPolicyPermission.permission_id,
      },
    }),
    prisma.role_permissions.upsert({
      where: {
        role_id_permission_id: {
          role_id: securityOfficerRole.role_id,
          permission_id: createPolicyPermission.permission_id,
        },
      },
      update: {},
      create: {
        role_id: securityOfficerRole.role_id,
        permission_id: createPolicyPermission.permission_id,
      },
    }),
  ]);
  await prisma.role_permissions.upsert({
    where: {
      role_id_permission_id: {
        role_id: securityOfficerRole.role_id,
        permission_id: mapControlsPermission.permission_id,
      },
    },
    update: {},
    create: {
      role_id: securityOfficerRole.role_id,
      permission_id: mapControlsPermission.permission_id,
    },
  });
  await prisma.$transaction([
    prisma.role_permissions.deleteMany({
      where: {
        role_id: role.role_id,
        permission_id: assignPolicyDepartmentPermission.permission_id,
      },
    }),
    prisma.role_permissions.upsert({
      where: {
        role_id_permission_id: {
          role_id: securityOfficerRole.role_id,
          permission_id: assignPolicyDepartmentPermission.permission_id,
        },
      },
      update: {},
      create: {
        role_id: securityOfficerRole.role_id,
        permission_id: assignPolicyDepartmentPermission.permission_id,
      },
    }),
  ]);
  await prisma.role_permissions.upsert({
    where: {
      role_id_permission_id: {
        role_id: employeeRole.role_id,
        permission_id: acknowledgePolicyPermission.permission_id,
      },
    },
    update: {},
    create: {
      role_id: employeeRole.role_id,
      permission_id: acknowledgePolicyPermission.permission_id,
    },
  });
  await prisma.$transaction([
    prisma.role_permissions.deleteMany({
      where: {
        role_id: role.role_id,
        permission_id: updatePolicyPermission.permission_id,
      },
    }),
    prisma.role_permissions.upsert({
      where: {
        role_id_permission_id: {
          role_id: securityOfficerRole.role_id,
          permission_id: updatePolicyPermission.permission_id,
        },
      },
      update: {},
      create: {
        role_id: securityOfficerRole.role_id,
        permission_id: updatePolicyPermission.permission_id,
      },
    }),
  ]);
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
  await prisma.$transaction(
    [role, securityOfficerRole, executiveRole].map((targetRole) =>
      prisma.role_permissions.upsert({
        where: {
          role_id_permission_id: {
            role_id: targetRole.role_id,
            permission_id: riskReadPermission.permission_id,
          },
        },
        update: {},
        create: { role_id: targetRole.role_id, permission_id: riskReadPermission.permission_id },
      }),
    ),
  );
  await prisma.$transaction(
    [role, securityOfficerRole].map((targetRole) =>
      prisma.role_permissions.upsert({
        where: {
          role_id_permission_id: {
            role_id: targetRole.role_id,
            permission_id: riskCreatePermission.permission_id,
          },
        },
        update: {},
        create: { role_id: targetRole.role_id, permission_id: riskCreatePermission.permission_id },
      }),
    ),
  );
  await prisma.$transaction(
    [role, securityOfficerRole].map((targetRole) =>
      prisma.role_permissions.upsert({
        where: {
          role_id_permission_id: {
            role_id: targetRole.role_id,
            permission_id: riskCancelPermission.permission_id,
          },
        },
        update: {},
        create: { role_id: targetRole.role_id, permission_id: riskCancelPermission.permission_id },
      }),
    ),
  );
  await prisma.$transaction(
    [role, securityOfficerRole].map((targetRole) =>
      prisma.role_permissions.upsert({
        where: {
          role_id_permission_id: {
            role_id: targetRole.role_id,
            permission_id: riskUpdatePermission.permission_id,
          },
        },
        update: {},
        create: { role_id: targetRole.role_id, permission_id: riskUpdatePermission.permission_id },
      }),
    ),
  );
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
    aiAlertThresholdManagePermission,
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
  for (const permission of [
    aiAlertReadPermission,
    aiAlertFeedbackPermission,
    aiAlertConfirmPermission,
    aiAlertThresholdManagePermission,
  ]) {
    await prisma.role_permissions.upsert({
      where: {
        role_id_permission_id: {
          role_id: securityOfficerRole.role_id,
          permission_id: permission.permission_id,
        },
      },
      update: {},
      create: {
        role_id: securityOfficerRole.role_id,
        permission_id: permission.permission_id,
      },
    });
  }
  await prisma.role_permissions.upsert({
    where: {
      role_id_permission_id: {
        role_id: executiveRole.role_id,
        permission_id: aiAlertReadPermission.permission_id,
      },
    },
    update: {},
    create: {
      role_id: executiveRole.role_id,
      permission_id: aiAlertReadPermission.permission_id,
    },
  });
  await prisma.$transaction([
    prisma.role_permissions.deleteMany({
      where: {
        role_id: securityOfficerRole.role_id,
        permission_id: policyPublishPermission.permission_id,
      },
    }),
    prisma.role_permissions.upsert({
      where: {
        role_id_permission_id: {
          role_id: role.role_id,
          permission_id: policyPublishPermission.permission_id,
        },
      },
      update: {},
      create: { role_id: role.role_id, permission_id: policyPublishPermission.permission_id },
    }),
  ]);

  const allPermissionIds = await prisma.permissions.findMany({
    select: { permission_id: true },
  });
  await prisma.role_permissions.createMany({
    data: allPermissionIds.map(({ permission_id }) => ({
      role_id: role.role_id,
      permission_id,
    })),
    skipDuplicates: true,
  });
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
