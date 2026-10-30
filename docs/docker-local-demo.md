# Docker local demo

Run from backend root (frontend sibling must be ../SecuraAI-Frontend):

```powershell
node scripts/prepare-docker-demo.cjs
docker compose --env-file .env.docker -f compose.demo.yml up -d --build
docker compose --env-file .env.docker -f compose.demo.yml ps
docker compose --env-file .env.docker -f compose.demo.yml logs -f backend worker
```

Frontend: http://localhost:3001. Swagger: http://localhost:3000/docs.
pgAdmin: 127.0.0.1:5433, postgres, securaai_demo, same local password.

This demo requires the existing external volume securaai-postgres-demo-data,
populated by the Supabase application snapshot. It never resets, seeds or
migrates automatically. Put DEMO_DB_PASSWORD in ignored .env.docker, using the
existing database password. Changing that variable does not change a password
inside an initialized PostgreSQL volume. This is not a blank-database installer.

Run prepare-docker-demo.cjs after changing .env. It writes ignored .env.docker and .env.docker.runtime without printing secrets or changing the original .env. Runtime BE secrets come from .env.docker.runtime. Compose overrides database networking,
Ollama address, local CORS and the pipeline switch. Host .env URLs, including the
commented Supabase URL, are preserved. Images exclude env files and database dumps.
Evidence uploads use the existing ./uploads bind mount. Use localhost in the
browser; production Secure HttpOnly cookies remain enabled.

Stop host FE/BE/worker processes before Docker starts to release 3000/3001 and
avoid an extra worker. Stop standalone securaai-postgres-demo before Compose
claims 5433. Never run two PostgreSQL instances on the same volume concurrently.
The old container is retained stopped for rollback. All published ports bind to
127.0.0.1. Docker Desktop must be running.

Frontend browser URL is built as http://localhost:3000/api/v1. Server/BFF runtime
BACKEND_API_BASE_URL is http://backend:3000/api/v1. Google login requires its
optional public client ID at build time. No secrets belong in NEXT_PUBLIC values.

Ollama remains on Windows at http://host.docker.internal:11434. If it only listens
on loopback, configure its listening address for Docker before expecting LLM
explanations. Detection preserves fallback explanation when Ollama is unavailable.
Wazuh keeps posting to http://host.docker.internal:3000/api/v1/integrations/wazuh/events.

To stop Docker and return to host execution:

```powershell
docker compose --env-file .env.docker -f compose.demo.yml down
docker start securaai-postgres-demo
```

Then run npm run dev in FE and BE. The BE dev command starts its worker automatically; do not run a second worker. Both modes share local data; do not remove the
external volume. Local writes do not modify Supabase.
