# Incident handling phases

This is SecuraAI's workflow decision, not a claim that all incident-response
products use these exact transitions. Project Tracking has no separate Incident
Start Triage use case. The existing progress contract is migrated to V2.

## Normal flow

OPEN -> TRIAGE -> CONTAINMENT -> ERADICATION -> RECOVERY -> LESSONS_LEARNED.

Classification and handler assignment preserve the existing phase, including OPEN.
They record priority/responsibility, not the analyst's readiness assessment.
Selecting the same handler is still a no-op. The Security Officer explicitly starts
TRIAGE using Update handling phase; this means investigation starts, not that triage
has already finished.

POST containment/eradication/recovery-actions only records completed work in the
current or an earlier operational phase. It never changes the incident status.
Earlier-phase notes remain retrospective and never regress the case. Future-phase
records return 409 INCIDENT_PHASE_REQUIRED. CLOSED rejects new operational work.

PATCH /incidents/:incidentId/progress requires confirmed=true, a meaningful
readiness/results/validation note, expectedStatus and expectedUpdatedAt. The officer
assesses readiness for the next phase. No action count is used as a completion gate:
zero or multiple journal entries alone cannot establish whether the work is finished.
This module has no mandatory-task playbook capable of automatic completion checks.

Emergency jumps or deferred completion require a 10-2000 character skipReason.
The audit records the officer, before/after phase, note, exception and skipped phases;
earlier work is not marked complete. Transitions only move forward and cannot close.
Recovery -> Lessons learned cannot bypass current RECOVERY or the officer's explicit
restoration/validation attestation. The confirmation is a human assessment, not
proof supplied by the system.

The system does not independently verify infrastructure recovery. The confirmation
and note are the accountable officer's attestation.

## Interface and history

Actions -> Update handling phase is the one transition entry, not multiple Start
buttons. Current phase, destination, completion note and confirmation are visible.
The optional emergency reason is used only for exceptions. Actions for future phases
open read-only history, with recording disabled. Phase transition history is read via
GET /incidents/:incidentId/progress, paginated newest-first and available to active
Security Officers and Executives. Classification and assignment changes remain in
their existing histories. Mutation success refreshes lists/details/history without F5.
Stale concurrent writes return 409, so the officer must review current state again.

Recovery action no longer accepts recoveryCompleted; clients must use the explicit
progress confirmation. RCA saves are allowed only in LESSONS_LEARNED and never
change phase. Close Incident (UC63) is implemented separately below.

No table, column, enum, migration or bulk rewrite is added. Existing incident_actions
and audit_logs are reused. Pending legacy contracts decrease from 72 to 71, removing
only PATCH /incidents/{incidentId}/progress.

## Product boundary and limitations

Phase and response-action journals are separate concerns, as in commercial incident
response platforms. This lightweight implementation uses an explicit officer
assessment rather than introducing response tasks/playbooks or inferring completion
from journal writes. The exact phase ordering, justified forward exceptions,
future-action recording restriction and forward-only policy are SecuraAI decisions,
not requirements mandated by the vendors or NIST. Backward transitions, reopening
and a task-based completion engine are not implemented by this change. Existing
records and audit snapshots are retained; removing automatic transitions does not
rewrite previously stored phases.

## Close Incident (UC63)

GET /incidents/:incidentId/close provides backend-derived readiness and real closure
audit metadata to active Security Officers and Executives. POST on the same URL is
restricted to active Security Officers. In SecuraAI, closure requires current
LESSONS_LEARNED, nonblank saved root cause, lessons learned and improvement
recommendations, a 20-4000 character summary, confirmed=true and expectedUpdatedAt.
These are product rules interpreting the tracking requirement to finish recovery
and record necessary information, not universal vendor requirements. No journal
count proves completion; the officer attests required response/recovery work is
complete. Recommendations may remain documented follow-up.

Status CLOSED, server-owned closed_at and INCIDENT_CLOSED audit (officer, summary,
before/after status and timestamp) commit atomically in a serializable transaction
with a locked incident. Concurrent updates return 409 and require renewed review.
Repeated closure returns changed=false without changing timestamp or adding audit.
Existing response, assignment, severity and analysis histories remain accessible.
Existing closed records without closure audit display missing metadata honestly.
After closure, RCA findings and history are read-only. New or amended findings are
rejected with 409 INCIDENT_CLOSED under the same incident lock, preserving the
findings used during closure. Existing audit entries are not changed or removed.
The UI refreshes incident queries and shows the real closure record without F5.
No schema/migration is added. These new URLs do not replace a pending legacy
contract, so the pending count remains 71.

References informing the separation of response work, recovery validation and review:

- [ServiceNow separate response tasks](https://www.servicenow.com/docs/r/yokohama/security-management/security-incident-response/t_CreateResponseTask.html)
- [IBM QRadar SOAR task-based phases](https://www.ibm.com/docs/en/security-qradar/security-qradar-soar/saas?topic=designer-phases)

- [Microsoft containment, eradication and recovery](https://learn.microsoft.com/en-us/compliance/assurance/assurance-sim-containment-eradication-recovery)
- [ServiceNow incident closure workflow](https://www.servicenow.com/docs/r/security-management/security-incident-response/security-incident-closure-workflow_0.html)
- [NIST SP 800-61 Rev. 3](https://csrc.nist.gov/pubs/sp/800/61/r3/final)
