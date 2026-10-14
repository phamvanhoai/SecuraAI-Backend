-- Backfill creation events for Threats and Vulnerabilities that existed
-- before risk-context audit events were introduced.
INSERT INTO "audit_logs" (
  "id", "actor_user_id", "actor_type", "action", "resource_type", "resource_id",
  "occurred_at", "before_data", "after_data", "source", "record_hash"
)
SELECT
  gen_random_uuid(),
  risk."created_by",
  'USER'::"audit_actor_type",
  'RISK_THREAT_CREATED',
  'RISK',
  threat."risk_id",
  threat."created_at",
  NULL,
  jsonb_build_object(
    'id', threat."id",
    'name', threat."name",
    'description', threat."description",
    'vulnerabilityIds', COALESCE((
      SELECT jsonb_agg(link."vulnerability_id")
      FROM "risk_threat_vulnerabilities" link
      WHERE link."threat_id" = threat."id"
    ), '[]'::jsonb)
  ),
  'MIGRATION',
  encode(digest(threat."id"::text || ':RISK_THREAT_CREATED', 'sha256'), 'hex')
FROM "risk_threats" threat
JOIN "risks" risk ON risk."id" = threat."risk_id"
WHERE NOT EXISTS (
  SELECT 1 FROM "audit_logs" audit
  WHERE audit."action" = 'RISK_THREAT_CREATED'
    AND audit."resource_id" = threat."risk_id"
    AND audit."after_data"->>'id' = threat."id"::text
);

INSERT INTO "audit_logs" (
  "id", "actor_user_id", "actor_type", "action", "resource_type", "resource_id",
  "occurred_at", "before_data", "after_data", "source", "record_hash"
)
SELECT
  gen_random_uuid(),
  risk."created_by",
  'USER'::"audit_actor_type",
  'RISK_VULNERABILITY_CREATED',
  'RISK',
  vulnerability."risk_id",
  vulnerability."created_at",
  NULL,
  jsonb_build_object(
    'id', vulnerability."id",
    'name', vulnerability."name",
    'description', vulnerability."description",
    'controlIds', COALESCE((
      SELECT jsonb_agg(link."control_id")
      FROM "risk_vulnerability_controls" link
      WHERE link."vulnerability_id" = vulnerability."id"
    ), '[]'::jsonb)
  ),
  'MIGRATION',
  encode(digest(vulnerability."id"::text || ':RISK_VULNERABILITY_CREATED', 'sha256'), 'hex')
FROM "risk_vulnerabilities" vulnerability
JOIN "risks" risk ON risk."id" = vulnerability."risk_id"
WHERE NOT EXISTS (
  SELECT 1 FROM "audit_logs" audit
  WHERE audit."action" = 'RISK_VULNERABILITY_CREATED'
    AND audit."resource_id" = vulnerability."risk_id"
    AND audit."after_data"->>'id' = vulnerability."id"::text
);
