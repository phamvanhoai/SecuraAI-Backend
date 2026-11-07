# Contextual actor workflow audit

Source: project-docs/new/Report3_Project Tracking.xlsx, WBS actor column.

| UC | Actor | Enforcement |
|---|---|---|
| 18 Assess Control Effectiveness | Control Owner / Security Officer | Assigned control ownership; new Employee owners require explicit CONTROL_OWNER eligibility. |
| 19 Assess Residual Risk | Risk Owner | Assigned Risk Owner only. |
| 20 Define Target Risk | Risk Owner | Assigned Risk Owner and eligible treatment plan. |
| 21/22 Update/Create Risk Treatment Plan | Risk Owner / Security Officer | Existing scoped risk/plan ownership and workflow transitions retained. Plan/action assignees remain responsible users. |
| 23 Accept, Review and Reassess Risk | Risk Owner / Authorized Approver | Owner submits/reviews owned risk. Employee AUTHORIZED_APPROVER eligibility applies specifically to Risk Acceptance. The approval workspace stays visible even when empty. Employee approvers can read only owned risks or risks with another user's pending request; requester/current Risk Owner cannot decide. Existing Security Officer/Executive approvers retained. No named approver assignment exists. |
| 45/46 View Asset List/Detail | Asset Owner / Security Officer | Ownership-scoped API; Employee navigation is visible with explicit Asset Owner eligibility even before assets are assigned. |
| 115 Review Risk Reassessment Request | Risk Owner | Assigned Risk Owner can start review/reject; server returns canReview/canReject. |
| 116 Reassess Residual Risk | Risk Owner / Security Officer | Under-review request required; server returns canReassess. Security Officer cannot start Owner review. |

New Risk, Control and Asset assignments require an active Employee with the matching explicit permanent GLOBAL ALLOW grant. Existing ownership remains valid without backfill or schema migration. Eligibility never grants unrelated record access. Business actors are not fixed role enum values.

UC23's description still lists Security Officer/Executive while its actor column includes Authorized Approver. The requested Employee responsibility model extends this workflow to explicitly granted Employee approvers. The workbook was not changed automatically.