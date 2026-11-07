# Experimental ML shadow inference

SecuraAI calls the separately deployed classifier for every evaluated event. With AI decisions disabled, the result remains shadow evidence alongside the legacy contextual detector. With both `AI_FUSION_ENABLED` and `AI_FUSION_CAN_CREATE_ALERTS` enabled, the system runs in AI-only decision mode: the model performs first-stage triage and only scores reaching the artifact's Validation-selected `escalationThreshold` are sent to the LLM for final review.

- AI-only mode does not query or evaluate the legacy seven-day empirical baseline and cannot fall back to legacy rules for alert creation.
- Only the past-only 1m/5m/15m/60m context required by ML and LLM is queried, bounded to the preceding 60 minutes.
- The ML response is stored as an `ml_shadow_prediction` feature contribution with contribution score `0`.
- ML or LLM timeout, network, HTTP and response-validation failures produce `AI_REVIEW_PENDING`; they never create an alert or fall back to legacy rules.
- Only an LLM `MALICIOUS` verdict creates or groups an alert. `BENIGN` and `SUSPICIOUS` do not.
- The classifier score is experimental and is not a calibrated probability.

Enable locally only after starting the FastAPI model service:

```env
ML_SHADOW_ENABLED=true
ML_SHADOW_BASE_URL=http://127.0.0.1:8000
ML_SHADOW_TIMEOUT_MS=2000
```

When the backend runs in Docker and FastAPI runs on the host, use `http://host.docker.internal:8000`. Review stored feature evidence and analyst feedback before considering any decision-making role for this model. Missing Windows/Sysmon fields in normalized VPN, SSO and application events are expected and must not be fabricated.

## Demo worker consistency

The API process and every detection worker connected to the same database must use the same
shadow-inference configuration and Backend image. A stale worker can claim durable detection jobs
before the current worker and persist detections without the expected shadow evidence. The demo
Compose configuration therefore enables shadow inference for both services through their shared
environment and uses `http://host.docker.internal:8002`, the local SecuraAI model port. Start the
host model service on an address reachable from Docker before starting the demo worker.
