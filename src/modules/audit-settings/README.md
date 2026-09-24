# View Login History

This module currently contains only the audit/settings domain scaffold. No audit-settings HTTP endpoint is implemented.

Search by attempted email or user name. Filter by status (success/failed), userId, exact IPv4/IPv6 ipAddress, inclusive from/to ISO timestamps with timezone. page defaults to 1, limit to 20 (max 100); sortBy=loginTime, sortOrder=desc. Equal timestamps are ordered by ID. Responses expose only the documented camelCase fields and pagination; userName/userId can be null for unknown accounts.

Authentication sessions and successful history records commit together. Bad credentials and inactive accounts record failed attempts using fixed reason codes. Refresh, logout, and malformed or rate-limited requests are not login events. Historical attempts before implementation are not backfilled from sessions. No schema change or live migration is needed.
