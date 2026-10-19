# Asset type catalog

Create and update bodies and the list `assetType` filter accept exactly:
`APPLICATION`, `SERVER`, `DATABASE`, `ENDPOINT`, `NETWORK_DEVICE`, `OTHER`.
These are stable category codes, not event source types or business services.
Type never assigns criticality, data classification or event ingestion support.
Existing ownership, links, classification and lifecycle workflows are unchanged.

Migration `20261019093000_standardize_asset_types` reuses `assets.asset_type`:
no new tables, columns or Prisma enum. It trims and uppercases recognized
categories and explicitly maps `Database Server` to `DATABASE` and
`Network device` to `NETWORK_DEVICE`. Unknown values abort the entire transaction
for manual review; they are never silently categorized as `OTHER`. Historical
audit snapshots are not rewritten. The migration adds `chk_assets_asset_type`.

Deployment order: review distinct legacy values, stop old writers, back up the
database, apply this migration, then deploy the matching BE and FE. Do not run
`migrate reset`. This migration takes a table lock and should run in a maintenance
window. Review all pending migrations before using `npm run db:deploy`.
`npm run db:verify` expects 185 checks (one more than the previous 184).
