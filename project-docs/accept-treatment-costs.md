# Accept treatment cost justification

The active Risk Register create/update plan endpoints accept `acceptanceCost`:
`costToFix` and `expectedLoss` are non-negative decimal strings (12 integer digits,
up to 2 decimals), `currency` is VND/USD, `periodMonths` is an integer 1–120, and
`basis` is 10–2000 characters. VND requires whole amounts. Both amounts represent
total costs/loss over the same stated period, not mismatched annual and one-time
figures. There is no automatic approval or numerical cost-ratio gate.

Accept requires a complete justification and no new treatment actions; UI explains
that no additional remediation is proposed, existing controls/monitoring continue.
Other strategies retain their action workflow and must not send acceptanceCost.
Update can preserve cancelled historical actions; existing completed actions are
immutable. To change a plan with ongoing work, explicitly cancel eligible actions
or use a subsequent plan. Cancellation itself does not require retroactive costs.

Only one nullable JSONB column `risk_treatment_plans.acceptance_cost_basis` is
added, with a CHECK constraint, by `20261019120000_add_acceptance_cost_basis`.
No new table. Existing plans and decisions remain unchanged (no fabricated costs).
Legacy Accept plans with missing costs are readable but cannot support a new
acceptance submission/approval until valid costs are recorded on an eligible plan.
Completed legacy plans remain locked; a new plan may be needed on the same Risk.

Create/update audit costs with plan changes. Acceptance submission snapshots costs
in the existing append-only audit record. Risk Detail and Review decision display
the submitted snapshot, not the current values from an unrelated plan. Existing
ownership, pending-request locks, optimistic revision checks and independent
approval remain authoritative. Rejection is still allowed for outdated requests.

Approving an acceptance completes only its exact submitted Accept plan (Draft or
Active), atomically with the decision and Risk ACCEPTED state, with a separate
plan-completion audit. It does not complete mitigation/avoidance/transfer work or
create fake remediation actions. Rejection leaves plan status unchanged. Already
approved historical requests are not retroactively rewritten by this behavior.

Deploy the additive migration before using the new FE/BE; do not reset the database
or auto-fill missing historical values. Inspect all pending migrations and schema
drift before deployment. No migration is automatically applied by this change.
