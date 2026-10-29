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

A rule match has signal score 0.9 and triggers independently of model/asset behavioral thresholds. Scores are not calibrated attack probabilities. Otherwise, severity, contextual behavior and off-hours use deployed weights normalized by their sum. The existing weights.rarity key is retained for compatibility but now weights contextual failure/new-context evidence, not global type rarity. With defaults the weights remain 0.45/0.35/0.2. Missing severity contributes zero. All-zero weights produce zero behavioral score but do not disable rule detections.

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

Import docs/contextual-detection-demo.json as JSON into an active source accepting all three families. Run manual detection on a clean source/model with default thresholds. Expected for this file alone: 49 evaluations, 9 rule matches, 6 alerts, 3 grouped matches. Three normal events and baseline events stay below the default threshold. Prior source history, old pending events, custom thresholds or existing open alerts can change totals. External IDs are fixed for safe duplicate-import checks; use a fresh source or intentional new IDs for another independent demo.

For App Access realtime, the Wazuh integration preserves data.application_id/application_name (or camelCase equivalents) as metadata. The updated script must be deployed to Wazuh separately; the repository change alone does not replace a running container's script.