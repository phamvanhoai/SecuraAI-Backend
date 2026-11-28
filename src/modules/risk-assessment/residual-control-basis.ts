import type { Prisma } from '@prisma/client';
import { z } from 'zod';

// Load the Control details needed for Residual and acceptance checks.
export const residualControlLinks = {
  select: {
    security_controls: {
      select: {
        id: true,
        implementation_status: true,
        applicability: true,
        updated_at: true,
        // Read linked Evidence and the dates used to check whether it is usable.
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
        // Read the latest assessment that has an effectiveness score.
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

// Use the result type of the Prisma query above.
type Links = Prisma.control_risk_linksGetPayload<typeof residualControlLinks>[];

/** Shared by residual assessment, acceptance submission and approval. */
export function validateResidualControls(
  links: Links,
  now = new Date(),
): 'control_assessments_required' | 'control_assessments_stale' | null {
  // Require at least one linked Control and an assessment for every Control.
  if (
    !links.length ||
    links.some(({ security_controls }) => !security_controls.control_assessments[0])
  )
    return 'control_assessments_required';
  // Block the operation if any linked Control fails the checks below.
  if (
    links.some(({ security_controls: control }) => {
      // The query above puts the newest assessment at index 0.
      const latest = control.control_assessments[0];
      return (
        // The Control must apply to this Risk.
        control.applicability !== 'APPLICABLE' ||
        // Planned or Not implemented Controls are not enough for this check.
        !['IMPLEMENTED', 'PARTIALLY_IMPLEMENTED'].includes(control.implementation_status) ||
        // There must be an assessment before reading its date.
        !latest ||
        // Reassess if the Control was updated after its assessment.
        latest.assessed_at < control.updated_at ||
        // Require at least one Evidence item that passes every condition below.
        !control.control_evidence_links.some(
          ({ linked_at, evidence_items: evidence }) =>
            // The Evidence must be Active.
            evidence.status === 'ACTIVE' &&
            // It must have been linked to the Control by the assessment time.
            linked_at <= latest.assessed_at &&
            // It must have been collected by the assessment time.
            evidence.collected_at <= latest.assessed_at &&
            // If a start time is set, the Evidence must already be valid.
            (!evidence.valid_from || evidence.valid_from <= now) &&
            // If an end time is set, the Evidence must not have expired.
            (!evidence.valid_until || evidence.valid_until > now),
        )
      );
    })
  )
    // This result also covers invalid applicability, deployment or Evidence.
    return 'control_assessments_stale';
  // All linked Controls passed these checks. Continue with the operation.
  return null;
}

// Build the Control snapshot saved with an assessment or acceptance request.
export function residualControlBasis(links: Links) {
  return links
    .map(({ security_controls: control }) => ({
      controlId: control.id,
      assessmentId: control.control_assessments[0]?.id ?? null,
      effectiveness: control.control_assessments[0]?.effectiveness?.toNumber() ?? null,
      assessedAt: control.control_assessments[0]?.assessed_at.toISOString() ?? null,
      implementationStatus: control.implementation_status,
      // Include all linked Evidence IDs, not a per-assessment Evidence selection.
      linkedEvidenceIds: control.control_evidence_links
        .map((link) => link.evidence_items.id)
        // Sort IDs so a different query order does not look like a data change.
        .sort(),
    }))
    // Sort Controls for the same reason before comparing snapshots.
    .sort((a, b) => a.controlId.localeCompare(b.controlId));
}

// Check the shape of a saved snapshot before comparing it with current data.
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
// Return true only when the saved snapshot is valid and matches the current Controls.
export function sameResidualControlBasis(value: unknown, links: Links): boolean {
  // Treat stored JSON as untrusted data and validate it with Zod.
  const parsed = controlBasisSchema.safeParse(value);
  return (
    parsed.success && JSON.stringify(parsed.data) === JSON.stringify(residualControlBasis(links))
  );
}
