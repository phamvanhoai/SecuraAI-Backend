# SecuraAI Backend

REST API SecuraAI cho quản lý rủi ro an toàn thông tin, tài sản, controls, chính sách, sự cố, security events và anomaly alerts.

## Công nghệ và kiến trúc

Node.js 22, Express 5, TypeScript strict, PostgreSQL, Prisma 6, Zod, Argon2id, JWT access token và rotating refresh token. OpenAPI/Swagger mô tả API; Vitest kiểm thử service/HTTP.

```text
route → controller → service → repository → Prisma → PostgreSQL
```

Domain code ở src/modules; shared middleware/errors ở src/common; environment ở src/config; Prisma lifecycle ở src/database; composition ở src/routes.

## Chạy local

Dùng Node.js 22 và PostgreSQL/Supabase có schema tương thích.

```powershell
Copy-Item .env.example .env
npm ci
npm run db:generate
npm run dev
```

Chỉ sao chép environment nếu chưa có. Điền DATABASE_URL, JWT_ACCESS_SECRET và các cấu hình cần thiết. Không commit credentials.

- API: http://localhost:3000/api/v1
- Swagger: http://localhost:3000/docs khi bật SWAGGER_ENABLED
- OpenAPI: http://localhost:3000/docs/openapi.json
- Health: GET /api/v1/health/live và /api/v1/health/ready
- FE local: http://localhost:3001

## Environment

Đối chiếu [.env.example](.env.example) và validation trong [src/config/env.ts](src/config/env.ts).

| Nhóm | Biến tiêu biểu |
| --- | --- |
| Server | PORT, API_PREFIX, CORS_ORIGINS, TRUST_PROXY, LOG_LEVEL, SWAGGER_ENABLED |
| Database | DATABASE_URL |
| Auth | JWT_ACCESS_SECRET, JWT_ACCESS_TTL_SECONDS, REFRESH_TOKEN_TTL_DAYS, GOOGLE_CLIENT_ID |
| Email | SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS |
| Explanation | OLLAMA_ENABLED, OLLAMA_BASE_URL, OLLAMA_MODEL, OLLAMA_TIMEOUT_MS |
| Worker | ANOMALY_AUTO_DETECTION_ENABLED, ANOMALY_AUTO_DETECTION_INTERVAL_MS |
| Ingestion | WAZUH_INGEST_TOKEN và integration API keys theo contract |
| Seed | ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_USERNAME, ADMIN_FULL_NAME, SEED_RISK_DEMO |

Ollama/Wazuh không bắt buộc để chạy các module GRC. Email và tích hợp cần cấu hình riêng để test end-to-end.

## Database

Baseline V2 gốc có 56 bảng, được mở rộng bằng additive migrations. Xem [schema Prisma](prisma/schema.prisma), [SQL baseline](project-docs/new/database.sql) và [migrations](prisma/migrations/).

- Baseline triển khai: prisma/migrations/00000000000000_baseline_v2/migration.sql.
- prisma/migrations-legacy chỉ tham khảo, không deploy.
- Database mới/rỗng: kiểm tra mục tiêu rồi chạy npm run db:deploy.
- Database đã có: đối chiếu migration history trước khi deploy phần còn thiếu.
- Không sửa migration đã áp dụng hoặc reset database để đồng bộ code.
- Sau thay đổi schema: npm run db:generate và npm run db:verify.
- db:verify đọc schema để đối chiếu thiết kế; kết quả live mới xác nhận database hiện tại.

npm run db:seed ghi dữ liệu có chủ đích, dùng account từ environment. SEED_RISK_DEMO=true bật bộ Risk demo có tiền tố DEMO. Không dùng mật khẩu demo ở môi trường triển khai.

## Các domain

| Module | Phạm vi |
| --- | --- |
| authentication-account | Login/Google, refresh/logout, reset/change password |
| user-management-authorization | Users, departments, import, account lifecycle, role/scope/ownership |
| it-asset-management | Assets, owner, classification/history, archive, context/history, business services |
| risk-assessment | Register, threat/vulnerability, inherent/residual, controls, treatment, target, acceptance và review/reassessment |
| policy-compliance-control | Draft/review/revision/approval/publish, applicability, acknowledgement, controls và evidence |
| information-security-incident-management | Reporting, severity, handler, response journals, RCA, close, links, weaknesses và reassessment requests |
| event-ingestion | Sources, Wazuh, file import, normalized events, mapping và governance |
| ai-anomaly-detection-alerts | Detection, alerts, thresholds, model metadata, explanation và triage/feedback |
| notification-system-logs | Notifications/email, preferences, reminders và system logs |
| audit-security-reporting | Audit/diffs, login history, API keys, dashboard và report exports |
| health | Liveness/readiness |

Đối chiếu [OpenAPI](src/docs/openapi.ts), [module notes](src/modules/README.md), routes/DTOs/services và tests cho từng endpoint. Một số contract V1 còn trả 501 ENDPOINT_NOT_IMPLEMENTED; chúng không thực thi code V3. Training đã loại khỏi active code. reference/legacy-v3 chỉ dùng tham khảo.

## Authentication và authorization

Role cố định: ADMIN, SECURITY_OFFICER, EXECUTIVE, EMPLOYEE. Risk Owner, Control Owner và Asset Owner là quan hệ trách nhiệm trên resource.

GET /api/v1/users/me trả capabilities cho navigation FE. Backend kiểm tra role, scope, ownership, trạng thái và transitions; không có cấu hình detailed permissions.

Refresh token lưu dạng hash và rotate khi dùng. Login trả lỗi riêng cho tài khoản không tồn tại; Locked/Inactive chỉ trả sau khi mật khẩu đúng; sai mật khẩu nhận lỗi chung. Các lần login được ghi history. Employee/Executive xem history cá nhân; Admin/Security Officer có phạm vi tổ chức.

## AI và Wazuh

```text
Wazuh alert → integration normalizer → POST /api/v1/integrations/wazuh/events
→ normalized event/entity mapping → detection record
→ score >= effective threshold: alert
→ analyst triage/feedback → incident khi xác nhận true positive
```

Thuật toán hiện tại tính score từ severity, rarity và off-hours; trọng số mặc định 0.45/0.35/0.20, có thể thay qua model parameters. Off-hours hiện xét UTC trước 06:00 hoặc từ 22:00. Đây là heuristic trong code, không phải Ollama tính điểm.

Asset override hợp lệ thay threshold model cho Asset đó. Worker bật mặc định, interval mẫu 5 giây, mỗi lượt tối đa 100 events và tiếp tục khi còn batch đầy. Manual detection qua POST /api/v1/anomaly-detections/runs; phạm vi/bounds theo DTO và service.

Ollama hỗ trợ văn bản explanation. Explanation được lưu để đọc lại và có luồng regenerate. LLM không tự thay Risk hoặc xác nhận sự cố. Metrics chỉ phản ánh evaluation đã ghi nhận, không suy diễn khi thiếu dữ liệu.

Scripts Wazuh: [scripts/wazuh](scripts/wazuh). Wazuh gửi qua API ingestion SecuraAI, khác Manager API/Indexer. Khi manager chạy trong Docker và backend trên host, cấu hình hook local dùng host.docker.internal theo môi trường.

## Incident → Risk

Security Officer link incident với Asset/Control/Risk → ghi Control Weakness → tạo reassessment request → Risk Owner review → đánh giá lại residual theo eligibility.

Response journal không tự hoàn thành phase. Chuyển phase/close là thao tác riêng có readiness, stale guards và audit. Closed giữ lịch sử đọc và khóa sửa theo contract; không có reopen. Xem [incident workflow](project-docs/incident-workflow.md).

## Kiểm thử và build

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm audit
npx prisma validate
npm run db:verify
```

npm start chạy dist/server.js sau build. Tests không được phụ thuộc production services; mock data không phải dữ liệu production. db:verify cần database; chỉ báo đã xác minh live khi thực sự chạy.

## Tài liệu và đóng góp

[AGENTS.md](AGENTS.md) quy định architecture/security/Git; [src/modules/README.md](src/modules/README.md) mô tả nghiệp vụ; [project-docs/new](project-docs/new/) chứa database và Project Tracking hiện hành.

Nhánh công việc từ develop mới nhất → PR develop → PR main. Giữ tác giả/commit contributor; chỉ tạo integration branch khi conflict. Không push trực tiếp/force-push hoặc xóa develop/main. Không commit .env, credentials, dist, coverage, logs hoặc uploads.

## Employee business responsibilities

Employee business responsibilities: existing user_access_scopes now stores permanent GLOBAL ALLOW codes RISK_OWNER, CONTROL_OWNER, ASSET_OWNER, AUTHORIZED_APPROVER (Employee only). The assignment options no longer offer AUDIT_VIEW/POLICY_APPROVE; saving removes those old unused entries for the target user. Existing ownership is inferred without backfill (assignedAt null), and removing a responsibility/changing an owning Employee role requires transfer first (409 OWNERSHIP_TRANSFER_REQUIRED). Owner options and assignment validation require a grant or existing ownership for Employees; existing elevated-role assignment rules remain. Grants never bypass resource ownership checks or independently expose privileged navigation. Asset/Risk/Control assignment and responsibility revocation coordinate through user row locks. Authorized Approver eligibility requires a workflow-specific assignment and never grants global approval access. No schema migration or live data changes.

Employee responsibility selection is exclusive: at most one of Risk Owner, Control Owner, Asset Owner or Authorized Approver per Employee. An Employee may have no inherited responsibility; click the selected checkbox again to clear it. Transfer conflicting owned records before changing responsibility; legacy multiple ownership is preserved until explicitly resolved.
