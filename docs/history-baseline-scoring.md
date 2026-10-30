# Historical anomaly scoring (empirical-history-v1)

Current implementation replaces the 55-point base and all heuristic bonuses. Scores describe rarity in recorded history, never attack probability. No model is trained and Ollama never selects scores.

## Cohort and readiness

Read up to 7 days / 5000 prior events by source and principal (account, or IP when account is absent). Compare only the same event family, VPN versus SSO protocol, and explicit application identity for App Access. Never include future events, the evaluated event, or the current rolling window in its reference. History truncation, missing principal/application or unsupported outcomes withhold scoring. The default minimum is 20 active historical windows (detectionPolicy.minimumBaselineEvents, reused for compatibility). This is a configurable sample-size guard, not a scientifically validated universal minimum.

Only windows containing recorded activity are reference samples. Do NOT assume silent windows mean zero failures: ingestion completeness is unknown. Zero-failure windows with successful activity are included. Counts use aligned, non-overlapping reference windows, compared with the current rolling window. They are empirical operational comparisons, not a claim of exchangeability or statistical significance.

## Score

For failures per window, let n be observed reference windows and k the number with failure counts greater than or equal to the current count. Tail fraction = (k + 1) / (n + 1). The +1 finite-sample smoothing prevents a small baseline from yielding 100%.

Successful access can additionally compare recurrence of its IP, device and local hour against prior successful events, provided each signal has enough samples. Each historical recurrence excludes the observation itself. Constantly changing IPs/devices are therefore not automatically anomalous just because the next value is new. No business-hour or new-IP bonus is added.

If m signals are eligible: adjustedTail = min(1, m * min(tail fractions)); score = 100 * (1 - adjustedTail). This Bonferroni-style adjustment prevents choosing the rarest of several signals without accounting for how many were tested. The tails are empirical ranks, not calibrated p-values. No proven false-positive-rate bound is claimed. No training weights or source severity enter the score. Severity remains contextual evidence.

Example: 40 reference windows, none with as many failures as now, one eligible signal: 100 * (1 - 1/41) = 97.56. If 10 of 40 were equally or more unusual, score = 100 * (1 - 11/41) = 73.17. Identical data can correctly yield identical scores; finite samples imply discrete score steps.

## Persistence and alerting

Store statistical_baseline feature evidence with method, status, reason, sample counts, observed values, per-signal tails and adjustment. INSUFFICIENT_BASELINE has score:null in evidence; the required legacy numeric detection column uses zero only as an unscored storage sentinel. It must not be interpreted as evidence of normal behavior. It cannot create alerts. Manual results include insufficientBaseline so users know why no alert was created.

With READY history, create/group only if score >= effective model/asset threshold. Keep original detections and historical explanations unchanged; peak score grouping remains append-only. Group keys include empirical-history-v1, so heuristic and statistical scores are not combined. Processing identity is retained: no automatic historical replay, rescore, model switch or database migration. History-only detection has a cold-start limitation: new isolated demo accounts with six failures do not establish a baseline. Synthetic fixtures test implementation, not real-world accuracy. Use recorded operational history and independent labeled evaluation before claiming detection performance.

Changing threshold/window/cohort invalidates comparability; deploy a deliberately versioned configuration for controlled re-evaluation. This implementation does not recalibrate severity bands, add threat intelligence, privilege/MFA inference, or claim a particular precision/recall. Concept drift, poisoning, missing telemetry, low sample size and dependence between observations remain operational limitations.
