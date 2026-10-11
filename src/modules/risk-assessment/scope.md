# Explicit Risk scope

New POST /risks requests persist scope_type (ASSET or BUSINESS_SERVICE) and business_service_id for service scopes. An active Employee owner and active scope assets remain required; an empty service cannot start the existing asset-based assessment workflow.

GET /risks and GET /risks/{riskId} return scope: null for historical unrecorded scope, {type:"asset"}, or {type:"business_service",businessService:{id,name,status}}. Asset links are a recorded membership snapshot, not a snapshot of asset attributes or service name. Existing assessments continue to use risk_assets; no read synchronizes service membership.

Creating scope and asset links is atomic, with serializable validation. Service deletion is blocked by a foreign key. Historical scope is not inferred or backfilled. No new scope-update endpoint is introduced: membership review/update remains future work; users must not assume reassessment automatically updates membership.

Deployment: apply migration 20261003160000_risk_business_service_scope before starting the changed BE; regenerate Prisma Client and restart BE. The migration adds two columns, one foreign key, one CHECK and one index, no tables or historical data changes. Live database deployment requires explicit approval.
