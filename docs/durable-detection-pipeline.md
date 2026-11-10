# Durable detection pipeline

Enable `DETECTION_PIPELINE_ENABLED=true` only after applying migration
`20261030140000_durable_detection_jobs`. Local development only needs `npm run dev`:
it watches the API and automatically starts detection/explanation processing when
the pipeline flag is enabled. Do not also run `npm run worker` in this mode.
Production uses `npm run build`,
`npm start` and `npm run worker:start`; a serverless API alone cannot run the worker.

Flow: committed Wazuh event -> next one-minute worker cycle -> durable detection job ->
1/5/15/60-minute temporal context -> ML triage -> Foundation-Sec final review when
escalated -> stored alert/fallback explanation -> separate explanation job.
Imported events remain manual: each manual request claims at most its requested
batch size through the same queue. Automatic discovery selects Wazuh API events.

A unique event/model/engine job prevents duplicate scheduling. Claims use PostgreSQL
SKIP LOCKED and a ten-minute lease. Detection writes and job completion commit in
one transaction. Unexpected failures are retried with backoff up to five attempts.
Known ML/LLM availability, timeout and response-validation failures are recorded
immediately as Failed with a safe stage-specific reason and may be explicitly
retried by a Security Officer. A crashed worker's lease expires; processing can resume. Previous
model/event detections are not automatically replayed. Insufficient-baseline jobs
are terminal observations, not normality judgments, and are not silently rescored.

Personal history is preferred. Cold-start fallback uses the same event source,
family, VPN/SSO protocol and (for application access) explicit application, with at
least five distinct historical principals and the configured minimum active windows.
These are source-level comparison groups, not verified organizational peer groups.
Missing/truncated history produces Insufficient baseline, never an invented score.
See history-baseline-scoring.md for the empirical comparison and its limitations.

All alerts require score >= the applicable model/asset threshold. Ollama cannot
change scores or alert decisions. A deterministic explanation is saved immediately;
Ollama enrichment runs separately, preserves fallback on failure and uses a lease
and compare-and-set to avoid overwriting manual regeneration. An unavailable model
therefore does not block event ingestion or detection.

Security Events shows Pending, Processing, Insufficient baseline, Below threshold,
Linked to alert or Failed. A technical AI failure is never relabeled as normal or
review-pending. Older results show Previously evaluated. Scores are
historical unusualness indicators, not calibrated attack probabilities.

Local synthetic smoke test (PowerShell from backend root):

```powershell
./scripts/wazuh/demo-detection.ps1 -Case VpnBurst -BurstCount 12 -WithBaseline -Send
```

WithBaseline adds forty successful historical active windows for the same demo
account. It validates routing and baseline readiness; it is not evaluation data or
proof of detection accuracy. Use labeled independent data before reporting metrics.
