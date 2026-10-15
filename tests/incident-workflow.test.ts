import { expect, it } from 'vitest';
import {
  requireRecordPhase,
  validatePhaseTransition,
} from '../src/modules/information-security-incident-management/incident-workflow.js';

it('requires sequence or a justified emergency exception', () => {
  expect(validatePhaseTransition('TRIAGE', 'CONTAINMENT')).toEqual([]);
  expect(() => validatePhaseTransition('OPEN', 'ERADICATION')).toThrow(
    'Explain the emergency reason',
  );
  expect(
    validatePhaseTransition('OPEN', 'ERADICATION', 'Emergency isolation already performed'),
  ).toEqual(['TRIAGE', 'CONTAINMENT']);
});
it('never skips recovery verification, regresses or closes', () => {
  expect(() => validatePhaseTransition('OPEN', 'LESSONS_LEARNED', 'Emergency recovery')).toThrow(
    'Complete and verify Recovery',
  );
  expect(() => validatePhaseTransition('RECOVERY', 'ERADICATION')).toThrow('Only forward');
  expect(() => validatePhaseTransition('RECOVERY', 'CLOSED')).toThrow('Only forward');
  expect(() => validatePhaseTransition('CLOSED', 'RECOVERY')).toThrow('Only forward');
});
it('rejects future actions but allows current and retrospective records', () => {
  expect(() => requireRecordPhase('OPEN', 'RECOVERY')).toThrow('Move the incident');
  expect(() => requireRecordPhase('ERADICATION', 'RECOVERY')).toThrow('Move the incident');
  expect(() => requireRecordPhase('RECOVERY', 'RECOVERY')).not.toThrow();
  expect(() => requireRecordPhase('LESSONS_LEARNED', 'CONTAINMENT')).not.toThrow();
});
