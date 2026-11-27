import type {
  ControlEffectivenessRecord,
  controlEffectivenessRepository,
} from './control-effectiveness.repository.js';

export function controlAssessmentReview(
  control: ControlEffectivenessRecord,
  bases: Awaited<ReturnType<typeof controlEffectivenessRepository.evidenceBasis>>,
  now = new Date(),
): { reviewRequired: boolean; reviewReasons: string[] } {
  const latest = control.control_assessments[0];
  const reasons: string[] = [];
  if (!latest) return { reviewRequired: false, reviewReasons: reasons };
  if (control.updated_at > latest.assessed_at)
    reasons.push('Control configuration changed after the latest assessment.');
  if (
    control.applicability !== 'APPLICABLE' ||
    !['IMPLEMENTED', 'PARTIALLY_IMPLEMENTED'].includes(control.implementation_status)
  )
    reasons.push('The Control no longer meets operating effectiveness assessment conditions.');
  const basis = bases.get(latest.id);
  if (!basis?.length) {
    reasons.push(
      'Evidence snapshot was not recorded. The basis of this historical assessment cannot be verified.',
    );
  } else {
    for (const snapshot of basis) {
      const current = control.control_evidence_links.find(
        (link) => link.evidence_items.id === snapshot.id,
      )?.evidence_items;
      if (!current) {
        reasons.push(`Evidence "${snapshot.name}" is no longer linked or Active.`);
        continue;
      }
      if (current.valid_until && current.valid_until <= now)
        reasons.push(`Evidence "${snapshot.name}" has expired.`);
      else if (current.collected_at > now || (current.valid_from && current.valid_from > now))
        reasons.push(`Evidence "${snapshot.name}" is not currently valid.`);
      if (
        current.name !== snapshot.name ||
        current.source !== snapshot.source ||
        current.collected_at.toISOString() !== snapshot.collectedAt ||
        (current.valid_from?.toISOString() ?? null) !== snapshot.validFrom ||
        (current.valid_until?.toISOString() ?? null) !== snapshot.validUntil
      )
        reasons.push(`Evidence "${snapshot.name}" changed after the latest assessment.`);
    }
  }
  return { reviewRequired: reasons.length > 0, reviewReasons: reasons };
}
