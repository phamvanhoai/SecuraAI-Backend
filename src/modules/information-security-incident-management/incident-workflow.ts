import type { incident_status } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';

export const incidentPhases: readonly incident_status[] = [
  'OPEN',
  'TRIAGE',
  'CONTAINMENT',
  'ERADICATION',
  'RECOVERY',
  'LESSONS_LEARNED',
  'CLOSED',
];

export function requireRecordPhase(current: incident_status, phase: incident_status): void {
  if (incidentPhases.indexOf(current) < incidentPhases.indexOf(phase)) {
    throw new AppError(
      409,
      'INCIDENT_PHASE_REQUIRED',
      `Move the incident to ${phase.toLowerCase()} before recording this action`,
    );
  }
}

export function validatePhaseTransition(
  current: incident_status,
  target: incident_status,
  skipReason?: string,
): readonly incident_status[] {
  const from = incidentPhases.indexOf(current);
  const to = incidentPhases.indexOf(target);
  if (current === 'CLOSED' || target === 'CLOSED' || to <= from || from < 0 || to < 0)
    throw new AppError(
      409,
      'INVALID_INCIDENT_TRANSITION',
      'Only forward handling-phase transitions are allowed; closing is a separate workflow',
    );
  if (target === 'LESSONS_LEARNED' && current !== 'RECOVERY')
    throw new AppError(
      409,
      'RECOVERY_REQUIRED',
      'Complete and verify Recovery before starting lessons learned',
    );
  if (to > from + 1 && !skipReason)
    throw new AppError(
      422,
      'SKIP_REASON_REQUIRED',
      'Explain the emergency reason for skipping response phases',
    );
  return incidentPhases.slice(from + 1, to);
}
