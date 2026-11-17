import type { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { assessmentRequiresReview } from './vulnerability-workflow.js';
import { residualControlLinks, sameResidualControlBasis, validateResidualControls } from './residual-control-basis.js';
import { readAcceptanceContextBasis } from './acceptance-context-basis.js';
import { z } from 'zod';

/** Caller holds Risk UPDATE, Control/Asset/Evidence SHARE locks. No writes. */
export async function requireTreatmentPlanBasis(db: Prisma.TransactionClient, riskId: string) {
  const residual = await db.risk_assessments.findFirst({
    where: { risk_id: riskId, residual_rating: { not: null }, assessment_type: { not: 'TARGET_DEFINITION' } },
    orderBy: [{ assessed_at: 'desc' }, { id: 'desc' }],
  });
  if (!residual) throw new AppError(409, 'RESIDUAL_ASSESSMENT_REQUIRED', 'Assess residual risk before creating a treatment plan.');
  const inherent = await db.risk_assessments.findFirst({
    where: { risk_id: riskId, inherent_rating: { not: null }, inherent_likelihood: { not: null }, inherent_impact: { not: null },
      OR: [{ residual_rating: null }, { assessment_type: 'INCIDENT_REASSESSMENT' }] },
    orderBy: [{ assessed_at: 'desc' }, { id: 'desc' }],
  });
  const risk = await db.risks.findUnique({ where: { id: riskId }, select: {
    risk_threats: { select: { created_at: true, updated_at: true } },
    risk_vulnerabilities: { select: { created_at: true, updated_at: true } },
    control_risk_links: residualControlLinks,
    risk_assets: { select: { assets: { select: { id: true, classified_at: true } } } },
  } });
  if (!risk || !inherent || inherent.assessed_at > residual.assessed_at ||
      assessmentRequiresReview(inherent.assessed_at, [...risk.risk_threats, ...risk.risk_vulnerabilities]) ||
      residual.inherent_likelihood !== inherent.inherent_likelihood || residual.inherent_impact !== inherent.inherent_impact || residual.inherent_rating !== inherent.inherent_rating)
    throw new AppError(409, 'RISK_REASSESSMENT_REQUIRED', 'Risk context or inherent assessment changed. Reassess inherent then residual risk before creating a treatment plan.');
  if (risk.risk_assets.some(({ assets }) => assets.classified_at && assets.classified_at > inherent.assessed_at) ||
      (risk.risk_assets.length && await db.audit_logs.findFirst({ where: { resource_type: 'ASSET', resource_id: { in: risk.risk_assets.map(({ assets }) => assets.id) }, action: 'ASSET_CONTEXT_UPDATED', outcome: 'SUCCESS', occurred_at: { gt: inherent.assessed_at } }, select: { id: true } })))
    throw new AppError(409, 'RISK_REASSESSMENT_REQUIRED', 'Asset classification or context changed. Reassess inherent then residual risk before creating a treatment plan.');
  if (validateResidualControls(risk.control_risk_links))
    throw new AppError(409, 'CONTROL_REASSESSMENT_REQUIRED', 'Review current Controls and Evidence, assess Control effectiveness, then reassess residual risk before creating a treatment plan.');
  const audit = await db.audit_logs.findFirst({ where: { resource_type: 'RISK', resource_id: riskId, outcome: 'SUCCESS',
    action: { in: ['RISK_RESIDUAL_ASSESSED', 'RISK_ACCEPTANCE_SUBMITTED'] }, after_data: { path: ['assessmentId'], equals: residual.id } },
    orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }], select: { after_data: true } });
  const basis = z.object({ controlBasis: z.unknown(), contextBasis: z.object({ version: z.literal(1), assetHash: z.string(), evidenceHash: z.string() }) }).safeParse(audit?.after_data);
  if (!basis.success || !sameResidualControlBasis(basis.data.controlBasis, risk.control_risk_links))
    throw new AppError(409, 'RESIDUAL_BASIS_CHANGED', 'Save a new residual assessment using current Controls and Evidence before creating a treatment plan.');
  const current = await readAcceptanceContextBasis(db, riskId);
  if (basis.data.contextBasis.assetHash !== current.assetHash)
    throw new AppError(409, 'RISK_REASSESSMENT_REQUIRED', 'Asset classification or context changed. Reassess inherent then residual risk before creating a treatment plan.');
  if (basis.data.contextBasis.evidenceHash !== current.evidenceHash)
    throw new AppError(409, 'RESIDUAL_BASIS_CHANGED', 'Evidence changed after the residual assessment. Review Control effectiveness and save a new residual assessment before creating a treatment plan.');
  return residual;
}
