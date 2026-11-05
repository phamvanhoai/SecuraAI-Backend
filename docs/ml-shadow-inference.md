# Experimental ML shadow inference

SecuraAI calls the separately deployed classifier for every evaluated event. With AI decisions disabled, the result remains shadow evidence. With AI decisions enabled, the model performs first-stage triage and only scores reaching the artifact's Validation-selected `escalationThreshold` are sent to the LLM for final review.

- `empirical-history-v1` remains the only source of the stored detection score, threshold decision, alert and incident behavior.
- The ML response is stored as an `ml_shadow_prediction` feature contribution with contribution score `0`.
- Timeout, network, HTTP and response-validation failures are recorded as unavailable and never fail the primary detection run.
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
