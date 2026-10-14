import type { Prisma } from '@prisma/client';
import { z } from 'zod';

export const residualControlLinks = {
  select: {
    security_controls: {
      select: {
        id: true,
        implementation_status: true,
        applicability: true,
        updated_at: true,
        control_evidence_links: {
          select: {
            linked_at: true,
            evidence_items: {
              select: {
                id: true,
                status: true,
                collected_at: true,
                valid_from: true,
                valid_until: true,
              },
            },
          },
        },
        control_assessments: {
          where: { effectiveness: { not: null } },
          orderBy: { assessed_at: 'desc' },
          take: 1,
          select: { id: true, effectiveness: true, assessed_at: true },
        },
      },
    },
  },
} as const satisfies Prisma.control_risk_linksFindManyArgs;

type Links = Prisma.control_risk_linksGetPayload<typeof residualControlLinks>[];

/** Shared by residual assessment, acceptance submission and approval. */
export function validateResidualControls(
  links: Links,
  now = new Date(),
): 'control_assessments_required' | 'control_assessments_stale' | null {
  if (
    !links.length ||
    links.some(({ security_controls }) => !security_controls.control_assessments[0])
  )
    return 'control_assessments_required';
  if (
    links.some(({ security_controls: control }) => {
      const latest = control.control_assessments[0];
      return (
        control.applicability !== 'APPLICABLE' ||
        !['IMPLEMENTED', 'PARTIALLY_IMPLEMENTED'].includes(control.implementation_status) ||
        !latest ||
        latest.assessed_at < control.updated_at ||
        !control.control_evidence_links.some(
          ({ linked_at, evidence_items: evidence }) =>
            evidence.status === 'ACTIVE' &&
            linked_at <= latest.assessed_at &&
            evidence.collected_at <= latest.assessed_at &&
            (!evidence.valid_from || evidence.valid_from <= now) &&
            (!evidence.valid_until || evidence.valid_until > now),
        )
      );
    })
  )
    return 'control_assessments_stale';
  return null;
}

export function residualControlBasis(links: Links) {
  return links
    .map(({ security_controls: control }) => ({
      controlId: control.id,
      assessmentId: control.control_assessments[0]?.id ?? null,
      effectiveness: control.control_assessments[0]?.effectiveness?.toNumber() ?? null,
      assessedAt: control.control_assessments[0]?.assessed_at.toISOString() ?? null,
      implementationStatus: control.implementation_status,
      linkedEvidenceIds: control.control_evidence_links
        .map((link) => link.evidence_items.id)
        .sort(),
    }))
    .sort((a, b) => a.controlId.localeCompare(b.controlId));
}

const controlBasisSchema = z.array(
  z.object({
    controlId: z.string(),
    assessmentId: z.string().nullable(),
    effectiveness: z.number().nullable(),
    assessedAt: z.string().nullable(),
    implementationStatus: z.string(),
    linkedEvidenceIds: z.array(z.string()),
  }),
);
export function sameResidualControlBasis(value: unknown, links: Links): boolean {
  const parsed = controlBasisSchema.safeParse(value);
  return (
    parsed.success && JSON.stringify(parsed.data) === JSON.stringify(residualControlBasis(links))
  );
}
