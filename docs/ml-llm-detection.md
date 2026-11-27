# ML and LLM detection

SecuraAI calls the separately deployed classifier for every evaluated event. The model produces the first-stage score. SecuraAI compares it with the enabled Asset threshold, or the deployed model's common threshold when the Asset has no enabled override. Only scores reaching that configured threshold are sent to the LLM for final review.

- The pipeline has no statistical-rule fallback.
- Only the past-only 1m/5m/15m/60m context required by ML and LLM is queried, bounded to the preceding 60 minutes.
- The validated ML response is stored as `ml_prediction` evidence. The Backend does not calculate a separate feature-contribution score.
- ML or LLM timeout, network, HTTP and response-validation failures produce a durable `FAILED` job with a stage-specific error code. They never create an alert, fall back to legacy rules, or masquerade as a review-pending security decision. Security Officers may explicitly retry the event.
- Only an LLM `MALICIOUS` verdict creates or groups an alert. `BENIGN` and `SUSPICIOUS` do not.
- The classifier score is experimental and is not a calibrated probability.

Start the FastAPI model service and configure its address:

```env
ML_MODEL_BASE_URL=http://127.0.0.1:8000
ML_MODEL_TIMEOUT_MS=2000
```

When the backend runs in Docker and FastAPI runs on the host, use `http://host.docker.internal:8000`. Review stored feature evidence and analyst feedback before considering any decision-making role for this model. Missing Windows/Sysmon fields in normalized VPN, SSO and application events are expected and must not be fabricated.

## Demo worker consistency

The API process and every detection worker connected to the same database must use the same
detection-pipeline configuration and Backend image. A stale worker can claim durable detection jobs
before the current worker and persist results from an older engine. The demo Compose configuration
therefore points both services to the same ML endpoint through their shared environment and uses
`http://host.docker.internal:8002`, the local SecuraAI model port. Start the host model service on an
address reachable from Docker before starting the demo worker.
