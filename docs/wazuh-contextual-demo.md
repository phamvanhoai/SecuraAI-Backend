# Wazuh contextual detection demo (PowerShell)

Run from SecuraAI-Backend:

```powershell
# Generate raw Wazuh alert JSON only (does not send requests).
.\scripts\wazuh\demo-detection.ps1 -Case All

# Send through custom-securaai inside the running manager container.
.\scripts\wazuh\demo-detection.ps1 -Case All -Send
```

| Case | Scenario | Expected with defaults, isolated new account |
|---|---|---|
| AuthBurst | 6 failed Windows logins | 1 alert, 1 grouped match |
| AuthSuccess | 6 failures then successful Windows login | 2 alerts, 1 grouped match |
| AppDenial | 11 denied accesses to one application | 1 alert, 1 grouped match |
| AppSuccess | 11 denials then application login | 2 alerts, 1 grouped match |
| VpnBurst | 6 failed VPN logins | 1 alert, 1 grouped match |
| VpnNewContext | 20 successful SSO baseline events then success from a new IP outside local working hours | 1 alert |
| Normal | One ordinary successful event in each family | No alerts |
| All | Shared complete 49-event fixture | 6 alerts, 3 grouped matches |

All reuses the same authentication/application chains for both burst and subsequent-success rules, so it is not the sum of the independent case counts. Each execution adds unique accounts/external IDs and uses past event timestamps (newest at yesterday 18:00 UTC, 01:00 in the default Vietnam timezone). Inspect Security Events using the printed run ID. Events deliberately appear in yesterday's time range; select a suitable range in Security Events. Alerts are generated at detection time, so new alerts appear under the current detection time.

## Prerequisites

- Docker Desktop and the Wazuh manager container are running. Override its name with -Container if needed.
- ossec.conf contains the custom-securaai integration, api_key and hook_url pointing to the intended SecuraAI backend.
- The backend is running the new contextual engine with automated detection enabled and a deployed scoring configuration. This script does not start/reconfigure the backend, deploy a model, change thresholds or change your API key.
- The event source accepts AUTHENTICATION, APPLICATION_ACCESS and VPN_SSO.
- For App Access, deploy this repository's updated integration script preserving the application's identity:

```powershell
docker cp .\scripts\wazuh\custom-securaai single-node-wazuh.manager-1:/var/ossec/integrations/custom-securaai
docker exec single-node-wazuh.manager-1 chown root:wazuh /var/ossec/integrations/custom-securaai
docker exec single-node-wazuh.manager-1 chmod 750 /var/ossec/integrations/custom-securaai
```

Copying the script updates the integration on this local container. Existing ossec.conf is retained. For this direct demo execution no manager restart is required. Other Wazuh configurations may need a different ownership group; use the existing integration's group if it differs.

## What this verifies

Synthetic Wazuh Alert JSON -> custom-securaai normalizer inside Wazuh manager -> authenticated HTTP API -> normalized Security Events -> automated detection -> AI alerts/evidence.

It does not generate a real Windows attack, exercise Wazuh decoders/rules, or write events to the Wazuh Indexer/Dashboard. Synthetic alerts may therefore be visible in SecuraAI without appearing in Wazuh Dashboard. Do not press Run manual detection while verifying the automatic path. Allow ingestion and the automated worker to complete. Custom thresholds, existing mapped-asset overrides, unrelated pending events and configuration changes can affect observed totals.

API keys are read within the container and never printed. The script reports posted events only after finding a success log entry for that external ID. It stops on an unconfirmed send; earlier successful sends remain in the backend. JSON files are BOM-free for Windows PowerShell 5.1 compatibility. Temporary demo files remain under the printed directory for inspection; no credentials are written to them.