# Contextual detection v1

The shared realtime/manual engine evaluates pending events once per deployed model version AND engine revision. It uses deterministic rules and contextual signals, not an LLM classifier. Existing detections and explanations are preserved; legacy engine results are retained while contextual-rules-v1 records its own separate result.

## Rules

| Rule | Trigger within one source and matching account/IP (application/protocol when applicable) |
|---|---|
| AUTH_FAILURE_BURST | At least 5 authentication failures in 5 minutes |
| AUTH_SUCCESS_AFTER_FAILURE | Authentication success after at least 5 failures in 5 minutes |
| APP_DENIAL_BURST | At least 10 access denials in 5 minutes |
| APP_SUCCESS_AFTER_DENIAL | Successful application login/access after at least 10 denials in 5 minutes |
| VPN_SSO_FAILURE_BURST | At least 5 VPN or SSO failures in 5 minutes; VPN and SSO histories are separate |
| VPN_SSO_NEW_CONTEXT_OFF_HOURS | Successful VPN/SSO login outside working hours with a new IP or device, after at least 20 prior successful events for the same account/protocol/source |

Application rules require an explicit application identity in normalizedPayload.applicationId/applicationName, application.id/name or corresponding metadata fields. Missing application identity is not guessed. New context requires a complete, nontruncated 7-day baseline. No geolocation, MFA or malicious-IP evidence is invented.

## Scoring and thresholds

A rule match contributes to the evidence-weighted score described below. Alerts require score >= the configured model threshold or enabled asset override. Scores are not calibrated attack probabilities. Otherwise, severity, contextual behavior and off-hours use deployed weights normalized by their sum. The existing weights.rarity key is retained for compatibility but now weights contextual failure/new-context evidence, not global type rarity. With defaults the weights remain 0.45/0.35/0.2. Missing severity contributes zero. All-zero weights produce zero behavioral score; rule scores still require the applicable threshold.

Asset overrides continue to affect the behavioral threshold only. They cannot suppress explicit security rules. Store policy/weight/threshold snapshots for every evaluated event, including nonalerts. Rule matches, evidence IDs, time zone and baseline readiness are stored as feature contributions.

## Configuration

The deployed ai_model_versions.parameters supports detectionPolicy (no schema change):

```json
{
  "detectionPolicy": {
    "timeZone": "Asia/Ho_Chi_Minh",
    "workdayStartHour": 6,
    "workdayEndHour": 22,
    "windowMinutes": 5,
    "authenticationFailures": 5,
    "applicationDenials": 10,
    "vpnFailures": 5,
    "minimumBaselineEvents": 20
  }
}
```

These are initial defaults, not universal security standards. Invalid configurations fail explicitly rather than silently resetting thresholds. This change does not add a policy-editing UI or replace the deployed model. Migration 20261030020000_version_detection_engine adds one engine_version column and versions the event/model uniqueness constraint; it adds no table.

## Temporal scope and grouping

History is selected for each event's occurrence time, same source and account (IP only if account missing), bounded to 7 days and 5,000 events. Future events are excluded, including events with the same timestamp but a later ID. Counts include historical events from earlier manual batches and previously evaluated events. Manual/import and realtime use the same evaluation, regardless of the ingested-at time; the automatic worker still selects only direct Wazuh API events.

A very late event does not automatically rescore already processed events whose earlier history was incomplete. Replay requires a deliberately new model or engine revision; existing results are immutable. Truncated history is recorded; failure counts are lower bounds and new-context inference is disabled.

Within a fixed 15-minute event-time window, matches sharing model, source, family, account/IP, application, protocol and rule append correlated_detection evidence to an existing open alert (NEW/IN_TRIAGE/NEED_INVESTIGATION). Terminal alerts are not reused. All detections persist; grouped results report alertsGrouped separately from alertsCreated. A per-model database advisory lock serializes persistence across processes; event/model/engine uniqueness prevents duplicate evidence on retries, even when an older deployed worker shares this database. Grouping never changes original alert score, text or analyst status. Explanation baselineData includes correlatedEventCount; feature evidence links identify each grouped event.

Ollama generates prose only. Deterministic explanations are stored on failure/disabled service. Repeated same-group matches in a run share generation work; original/grouped evidence remains distinct. Generation precedes persistence and may add latency when many unrelated groups trigger; DB/LLM concurrency is bounded to four. No incident or risk changes occur automatically.

## Demo

Import docs/contextual-detection-demo.json as JSON into an active source accepting all three families. Run manual detection on a clean source/model with default thresholds. Expected rule evidence for this file alone: 49 evaluations and 9 rule matches. Actual alert/group counts depend on each score reaching the configured threshold. Three normal events and baseline events stay below the default threshold. Prior source history, old pending events, custom thresholds or existing open alerts can change totals. External IDs are fixed for safe duplicate-import checks; use a fresh source or intentional new IDs for another independent demo.

For App Access realtime, the Wazuh integration preserves data.application_id/application_name (or camelCase equivalents) as metadata. The updated script must be deployed to Wazuh separately; the repository change alone does not replace a running container's script.
## Evidence-weighted rule scores (v2)

Rule matches no longer all receive 0.90 or HIGH. This is a transparent prioritization heuristic, not a calibrated attack probability or trained-model result:

- Start at 0.55 when a rule matches.
- Add 0.10 per additional threshold-sized failure batch, proportionally, capped at 0.20.
- Add normalized source severity times 0.10; outside working hours adds 0.05.
- With sufficient non-truncated successful history, a new IP adds 0.05 and a new device adds 0.05.
- Successful access after the required failures/denials adds 0.10.
- Total is capped at 0.99. Severity: below 0.50 LOW; 0.50-0.7499 MEDIUM; 0.75-0.8999 HIGH; 0.90+ CRITICAL.

These initial engineering weights require evaluation against labeled organization data before making accuracy claims. Behavioral-only scoring and rule triggering conditions are unchanged. Scores may legitimately match when evidence is equivalent. Store the complete rule_score_breakdown (revision evidence-weighted-v2) in existing contributions. No schema migration is needed.

Existing detections and alerts are not rescored. New grouping keys include the scoring revision to avoid appending new-version matches to old 90% alerts. Event/model/engine processing identity stays unchanged so the worker does not replay historical events. Grouped alerts retain the first detection's score; subsequent scores are available in correlated evidence.

### Rule decisions and database compatibility

Apply migration `20261030033000_allow_rule_match_decisions` before running evidence-weighted scores. The former check required every anomaly to exceed the behavioral threshold; it rejected valid low-score rule matches and rolled back whole batches. The revised check permits `threshold_source = RULE_MATCH` only with `is_anomaly = true`. MODEL_DEFAULT and ASSET_OVERRIDE retain the exact score-threshold invariant. The configured threshold value remains stored, with its original source in configured_threshold feature evidence. No table or column is added and no existing result is rescored.

Automatic explanation generation has a shared 5-second deadline per batch. After it expires, the existing deterministic evidence-based fallback is stored. Explicit explanation regeneration retains its configured Ollama timeout. Database work still contributes to total batch latency; this is not a five-second end-to-end guarantee.

## Live priority updates (evidence-weighted-v3)

In addition to v2 signals, matched rules gain up to 10 priority points for temporal concentration: `10 * max(0, 1 - observedFailureSpan / configuredWindow)`, using the earliest related failure and current event time. The result is capped at 99 points. This is an engineering heuristic requiring labeled-data evaluation, not a probability model. Do not invent privileged-account or asset-criticality inputs when those facts are unavailable.

Open alerts retain a monotonic peak score across the fixed 15-minute same-rule/account/source/IP group. Each stronger match appends alert_score_update evidence containing previous/new scores, event/detection references, actor, reason, timestamp and scoring snapshot; alert severity updates atomically. The detection-run audit includes these changes. Original detection scores, features and explanation text are not overwritten. List/detail/explanation projections use the peak snapshot; explicit regeneration uses its evidence. Lower-scored later events do not reduce investigation priority. Terminal alerts cannot be updated. Rule chains remain separate groups so a successful access after failures gets a distinct decision. Existing alerts are not backfilled; send fresh events. No schema addition is required beyond the rule-decision migration above.


## Current policy: one threshold gate

All new decisions, realtime and manual, use `is_anomaly = score >= effective threshold`. Rules contribute to scoring only. An enabled asset override replaces the model threshold. Equality creates an alert; below threshold stores a normal detection without explanation generation, alert creation or grouping. New rows use MODEL_DEFAULT or ASSET_OVERRIDE; RULE_MATCH remains historical only. Existing detections and alerts are not rewritten or replayed. No schema migration is needed: the existing constraint already enforces equality for both current threshold sources. Earlier bypass descriptions above document the superseded implementation, not the current policy.
