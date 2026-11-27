import { expect, it } from 'vitest';
import type { ControlEffectivenessRecord } from '../src/modules/policy-compliance-control/control-effectiveness.repository.js';
import { controlAssessmentReview } from '../src/modules/policy-compliance-control/control-assessment-review.js';

const now = new Date('2026-11-23T00:00:00Z');
const evidence = { id: 'a', name: 'Report A', source: 'Testing', collected_at: new Date('2026-11-20'), valid_from: null as Date | null, valid_until: null as Date | null };
const snapshot = { id: 'a', name: evidence.name, source: evidence.source, collectedAt: evidence.collected_at.toISOString(), validFrom: null, validUntil: null };
const fixture = () => ({
  applicability: 'APPLICABLE', implementation_status: 'IMPLEMENTED', updated_at: new Date('2026-11-20'),
  control_assessments: [{ id: 'assessment', assessed_at: new Date('2026-11-21') }],
  control_evidence_links: [{ evidence_items: { ...evidence } }],
});
const run = (control = fixture(), bases = new Map([['assessment', [snapshot]]])) =>
  controlAssessmentReview(control as unknown as ControlEffectivenessRecord, bases, now);

it('does not flag a current assessment or merely adding another Evidence', () => {
  expect(run().reviewRequired).toBe(false);
  const control = fixture();
  control.control_evidence_links.push({ evidence_items: { ...evidence, id: 'b', name: 'New report B' } });
  expect(run(control).reviewRequired).toBe(false);
});
it('does not flag an unassessed Control', () => {
  const control = fixture(); control.control_assessments = [];
  expect(run(control, new Map())).toEqual({ reviewRequired: false, reviewReasons: [] });
});
it('flags missing historical snapshots without inventing Evidence', () => {
  expect(run(fixture(), new Map()).reviewReasons.join()).toContain('cannot be verified');
});
it('flags removing selected Evidence even when replacement Evidence exists', () => {
  const control = fixture(); control.control_evidence_links[0] = { evidence_items: { ...evidence, id: 'b' } };
  expect(run(control).reviewReasons.join()).toContain('no longer linked or Active');
});
it('flags expired Evidence', () => {
  const control = fixture();
  const expired = { ...evidence, valid_until: new Date('2026-11-22') };
  const value = { ...control, control_evidence_links: [{ evidence_items: expired }] };
  expect(run(value).reviewReasons.join()).toContain('expired');
});
it('flags changed Evidence metadata and Control configuration', () => {
  const control = fixture(); control.updated_at = new Date('2026-11-22');
  control.control_evidence_links[0] = { evidence_items: { ...evidence, source: 'Changed source' } };
  const result = run(control);
  expect(result.reviewReasons.join()).toContain('Control configuration changed');
  expect(result.reviewReasons.join()).toContain('Evidence "Report A" changed');
});
