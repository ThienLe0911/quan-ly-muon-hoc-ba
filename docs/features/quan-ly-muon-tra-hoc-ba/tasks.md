> Status: Validated (2026-11-26)

# Kế hoạch triển khai (Tasks): Quản lý Mượn – Trả Học Bạ (`quan-ly-muon-tra-hoc-ba`)

- **Spec tham chiếu:** [`spec.md`](spec.md) (`Approved`)
- **Kiến trúc tham chiếu:** [`architecture.md`](../../architecture/architecture.md) (`Approved`)
- **Quyết định kiến trúc liên quan:** [`ADR-001`](../../architecture/decisions/001-tech-stack-va-co-so-du-lieu.md), [`ADR-002`](../../architecture/decisions/002-co-che-xac-thuc-va-phan-quyen.md), [`ADR-003`](../../architecture/decisions/003-dinh-danh-hoc-ba-va-quy-tac-qua-han.md) (đã duyệt `Accepted`)

---

## Điều kiện tiên quyết trước khi chạy `/implement/quan-ly-muon-tra-hoc-ba`

1. **Duyệt ADR & Kiến trúc:** Các task dưới đây giả định chủ dự án chọn **Phương án 1** cho cả 3 ADR (`001`: Next.js + Tailwind CSS + Drizzle ORM + `better-sqlite3`, `002`: Session SQLite + Cookie `HttpOnly` + `scrypt`, `003`: khóa `record_identity_key` + Partial Unique Index + tính quá hạn theo `Asia/Ho_Chi_Minh`). Nếu chủ dự án chọn phương án khác, `tasks.md` phải được cập nhật tương ứng.
2. **Duyệt đồng bộ `architecture.md`:** Cần chủ dự án cho phép cập nhật mục 4.2 trong `docs/architecture/architecture.md` (sửa quyền `POST /api/loans` từ `Authenticated` thành `TEACHER` theo chốt không cho phép mượn hộ).
3. **Duyệt tài liệu SPDD:** Chủ dự án chuyển marker trạng thái sang `Accepted` cho 3 ADR và `Approved (YYYY-MM-DD)` cho `spec.md` & `tasks.md`.
4. **Duyệt cài đặt dependency mới ở Task `T01`:**
   - **Runtime dependencies:** `next`, `react`, `react-dom`, `drizzle-orm`, `better-sqlite3`, `zod`, `lucide-react`
   - **Dev/Test dependencies:** `typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `@types/better-sqlite3`, `tailwindcss`, `@tailwindcss/postcss`, `drizzle-kit`, `vitest`, `eslint`, `eslint-config-next`, `tsx`

---

## Bản đồ song song hóa (Parallel Execution Matrix)

Các task cùng `Wave` và gắn nhãn `[Parallel: Wave N]` là **độc lập, khác file, không xung đột merge**, có thể giao cho nhiều subagent ở workspace `branch` chạy song song khi triển khai:

| Wave | Chế độ | Các Task | Ghi chú đồng bộ |
| --- | --- | --- | --- |
| Wave 1 | Tuần tự | `T01` → `T02` | Dựng khung dự án và tầng DB/migration trước |
| Wave 2 | Song song (`[Parallel: Wave 2]`) | `T03`, `T04`, `T05` | 3 nhóm module lõi hoàn toàn khác thư mục (`domain/`, `auth/`, `api/` + `audit/`) |
| Wave 3 | Song song (`[Parallel: Wave 3]`) | `T06`, `T07`, `T08`, `T09` | 4 nhóm Route Handlers API + integration tests tách biệt theo route |
| Wave 4 | `T10` trước → Song song (`[Parallel: Wave 4]`) | `T10` → (`T11`, `T12`, `T13`) | `T10` dựng layout/components chung + login; 3 UI portal chạy song song khác thư mục |
| Wave 5 | Tuần tự | `T14` | Đóng gói Docker, tài liệu vận hành, kiểm thử tổng thể (`lint`, `typecheck`, `test`, `build`) |

---

## Danh sách Tasks chi tiết

### Wave 1 — Khung dự án & Cơ sở dữ liệu (Tuần tự)

- [x] **T01: Khởi tạo khung Next.js (App Router, TypeScript), Tailwind CSS, Vitest và cấu hình môi trường `[Sequential]`**
  - **Phụ thuộc:** Chưa có (cần duyệt danh sách dependency ở mục Điều kiện tiên quyết).
  - **Phạm vi file dự kiến:**
    - `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `eslint.config.mjs`
    - `.env.example`, `.gitignore`
    - `src/app/layout.tsx`, `src/app/globals.css`
    - `src/lib/env.ts`
  - **Mô tả triển khai:**
    - Khởi tạo dự án Next.js TypeScript với App Router và Tailwind CSS v4 (hoặc cấu hình chuẩn Next.js hiện hành), cấu hình `serverExternalPackages: ['better-sqlite3']` trong `next.config.ts`.
    - Cấu hình các script chuẩn trong `package.json`: `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `db:migrate`, `db:seed`.
    - Tạo `.env.example` với `DATABASE_PATH=./data/app.db`, `TZ=Asia/Ho_Chi_Minh`, `AUTH_COOKIE_SECURE=false`, `SEED_ADMIN_USERNAME=admin`, `SEED_ADMIN_PASSWORD=...`, `SEED_ADMIN_NAME=Văn thư nhà trường`.
    - Tạo `src/lib/env.ts` đọc và validate biến môi trường an toàn (có giá trị mặc định hợp lý cho môi trường local/test).
    - Tạo `src/app/layout.tsx` (khai báo `lang="vi"`, font chữ hỗ trợ tiếng Việt rõ ràng) và `src/app/globals.css`.
  - **Tiêu chí hoàn thành & kiểm chứng:**
    - Chạy `npm run typecheck` và `npm run lint` thoát với exit code `0`.
    - Chạy `npm run test` (Vitest) khởi động thành công.

- [x] **T02: Thiết lập SQLite (WAL + FK), Drizzle Schema, Migration (Partial Unique Index) và Seed dữ liệu `[Sequential]`**
  - **Phụ thuộc:** `T01`
  - **Phạm vi file dự kiến:**
    - `drizzle.config.ts`
    - `src/db/schema.ts`, `src/db/index.ts`, `src/db/migrate.ts`, `src/db/seed.ts`
    - `src/db/migrations/0000_initial.sql`
    - `src/db/db.test.ts`
  - **Mô tả triển khai:**
    - Định nghĩa đầy đủ 5 bảng theo `architecture.md`: `users`, `sessions`, `loan_records`, `system_settings`, `audit_logs` trong `src/db/schema.ts`.
    - Viết `src/db/migrations/0000_initial.sql` (hoặc sinh từ Drizzle và bổ sung phần SQL) chứa đầy đủ `CHECK` constraint và 4 index trên `loan_records`, đặc biệt là Partial Unique Index `idx_loan_active_identity ON loan_records(record_identity_key) WHERE status = 'BORROWED'`.
    - Trong `src/db/index.ts`, cấu hình singleton kết nối `better-sqlite3` tự tạo thư mục cha nếu chưa tồn tại, bật `PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys = ON`, `PRAGMA busy_timeout = 5000`, và hỗ trợ tạo DB test cô lập (in-memory `:memory:` hoặc temp file).
    - Viết `src/db/migrate.ts` chạy migration idempotent và `src/db/seed.ts` khởi tạo `default_loan_days = '7'`, `max_loan_days = '30'` và tài khoản Admin đầu tiên (chỉ tạo nếu chưa có Admin nào).
  - **Tiêu chí hoàn thành & kiểm chứng:**
    - Chạy `npm run test -- src/db/db.test.ts` pass: kiểm chứng migration tạo đủ 5 bảng, `idx_loan_active_identity` chặn chèn 2 dòng `BORROWED` cùng `record_identity_key` ở tầng SQLite nhưng cho phép chèn lại sau khi dòng cũ thành `RETURNED` hoặc `CANCELLED`, và `seed` chạy lặp lại không bị trùng dữ liệu.

---

### Wave 2 — Tầng Domain, Bảo mật & Tiện ích chung (`[Parallel: Wave 2]`)

- [x] **T03: Domain chuẩn hóa định danh học bạ, kiểm tra niên khóa và tính quá hạn theo giờ Việt Nam `[Parallel: Wave 2]`**
  - **Phụ thuộc:** `T01`
  - **Phạm vi file dự kiến:**
    - `src/lib/domain/record-identity.ts`
    - `src/lib/domain/overdue.ts`
    - `src/lib/domain/domain.test.ts`
  - **Mô tả triển khai:**
    - `record-identity.ts`: chuẩn hóa `className`, `studentName`, `schoolYear` (`NFC`, `trim()`, gộp nhiều khoảng trắng thành 1, chuyển `–`/`—` và khoảng trắng quanh `-` ở `schoolYear` về `YYYY-YYYY`). Validate `schoolYear` bắt buộc khớp `^\d{4}-\d{4}$`, `endYear > startYear`, `1 <= endYear - startYear <= 10` (BR-01, AC-14). Tạo hàm `buildRecordIdentityKey(...)` (`toLocaleLowerCase('vi-VN')` nối bằng `|`).
    - `overdue.ts`: hàm `getTodayVNDateString(now?: Date)` lấy ngày lịch `YYYY-MM-DD` theo `Asia/Ho_Chi_Minh`; `addCalendarDays(dateStr, days)`; `diffCalendarDays(laterDateStr, earlierDateStr)`; `classifyLoanTiming(dueDate, status, todayVN)` trả về `overdueDays` và `level` (`CRITICAL` `>= 8`, `MODERATE` `4..7`, `MILD` `1..3`, `DUE_TODAY` `0`, `DUE_SOON` `-2..-1`, `ON_TIME` `<= -3`, `CLOSED` nếu không phải `BORROWED`), plus cờ `isInRedList` (`status === 'BORROWED' && overdueDays >= 1`).
  - **Tiêu chí hoàn thành & kiểm chứng:**
    - Chạy `npm run test -- src/lib/domain/domain.test.ts` pass đầy đủ unit test: chuẩn hóa tiếng Việt có dấu (`3a ` + `Nguyễn   Văn An` + `2025 – 2026`), từ chối `25-26` / `2026-2025` / `2010-2025`, chấp nhận `2021-2026`, kiểm tra ranh giới múi giờ `23:30 UTC` (= `06:30 +07` hôm sau) và đúng đủ 6 ngưỡng phân mức độ lố hạn (AC-04, AC-06, AC-08, AC-14).

- [x] **T04: Dịch vụ mật khẩu (`scrypt`), Session DB (`HttpOnly`), Rate Limit và RBAC Guards `[Parallel: Wave 2]`**
  - **Phụ thuộc:** `T02`
  - **Phạm vi file dự kiến:**
    - `src/lib/auth/password.ts`
    - `src/lib/auth/session.ts`
    - `src/lib/auth/rate-limit.ts`
    - `src/lib/auth/guards.ts`
    - `src/lib/auth/auth.test.ts`
  - **Mô tả triển khai:**
    - `password.ts`: băm và đối chiếu mật khẩu bằng `crypto.scrypt` + salt ngẫu nhiên 16 bytes + `crypto.timingSafeEqual`.
    - `session.ts`: tạo token 32 bytes hex, lưu SHA-256 hash vào bảng `sessions`, đọc/ghi/xóa cookie `HttpOnly` (`SameSite=Lax`, `Secure` theo `AUTH_COOKIE_SECURE`), hàm `revokeAllUserSessions(userId)` dùng khi khóa tài khoản hoặc reset mật khẩu.
    - `rate-limit.ts`: giới hạn số lần đăng nhập sai liên tiếp theo IP + `username` trong bộ nhớ (vd: sai 5 lần trong 15 phút thì tạm chặn `429`).
    - `guards.ts`: `getCurrentUser()`, `requireAuth()`, `requireAdmin()`, `requireTeacher()` kiểm tra đồng thời phiên hợp lệ, chưa hết hạn và `user.isActive === 1`.
  - **Tiêu chí hoàn thành & kiểm chứng:**
    - Chạy `npm run test -- src/lib/auth/auth.test.ts` pass: xác minh hash/verify đúng & sai mật khẩu, tạo/đọc/thu hồi session, tài khoản `is_active = 0` bị chặn ngay dù session chưa hết hạn, rate-limit kích hoạt sau số lần sai quy định (AC-01, AC-02).

- [x] **T05: Chuẩn hóa API Response, Zod Validators và Audit Logger `[Parallel: Wave 2]`**
  - **Phụ thuộc:** `T02`
  - **Phạm vi file dự kiến:**
    - `src/lib/api/response.ts`
    - `src/lib/api/validators.ts`
    - `src/lib/audit/logger.ts`
    - `src/lib/audit/logger.test.ts`
  - **Mô tả triển khai:**
    - `response.ts`: helper `jsonSuccess(data, meta?, status?)` và `jsonError(code, message, status, details?)` theo đúng format `{ data, meta? }` / `{ error: { code, message, details? } }`.
    - `validators.ts`: schema `zod` cho Login, ChangePassword, CreateUser, UpdateUser, ResetPassword, CreateLoan (khẳng định không nhận `teacherId` hoặc từ chối trường lạ không hợp lệ), ReturnLoan, CancelLoan (bắt buộc `reason >= 3` ký tự), UpdateSettings (`1 <= defaultLoanDays <= maxLoanDays <= 90` hoặc kiểm tra chéo), và query params lọc danh sách.
    - `logger.ts`: hàm `writeAuditLog({ actorId, action, targetType, targetId, metadata })` ghi vào bảng `audit_logs`, có hỗ trợ chạy trong cùng transaction DB.
  - **Tiêu chí hoàn thành & kiểm chứng:**
    - Chạy `npm run test -- src/lib/audit/logger.test.ts` pass: xác nhận format JSON error/success, validation từ chối payload sai quy tắc và `writeAuditLog` ghi đúng cấu trúc JSON vào SQLite (AC-13).

---

### Wave 3 — Tầng API Route Handlers (`[Parallel: Wave 3]`)

- [x] **T06: API Xác thực (`/api/auth/login`, `/logout`, `/me`, `/change-password`) `[Parallel: Wave 3]`**
  - **Phụ thuộc:** `T03`, `T04`, `T05`
  - **Phạm vi file dự kiến:**
    - `src/app/api/auth/login/route.ts`
    - `src/app/api/auth/logout/route.ts`
    - `src/app/api/auth/me/route.ts`
    - `src/app/api/auth/change-password/route.ts`
    - `src/app/api/auth/auth-routes.test.ts`
  - **Mô tả triển khai:**
    - `POST /api/auth/login`: kiểm tra rate limit, tìm user theo `username.trim().toLowerCase()`, kiểm tra `isActive === 1` và mật khẩu, tạo session + set cookie, ghi audit `LOGIN_SUCCESS` hoặc `LOGIN_FAILED`.
    - `POST /api/auth/logout`: xóa session trong DB, clear cookie, ghi audit `LOGOUT`.
    - `GET /api/auth/me`: trả thông tin người dùng hiện tại (không bao giờ trả `passwordHash`).
    - `POST /api/auth/change-password`: xác minh mật khẩu cũ, cập nhật `passwordHash`, đặt `mustChangePassword = 0`, giữ phiên hiện tại hoặc thu hồi các phiên khác, ghi audit `PASSWORD_CHANGED`.
  - **Tiêu chí hoàn thành & kiểm chứng:**
    - Chạy `npm run test -- src/app/api/auth/auth-routes.test.ts` pass: test login thành công/thất bại, tài khoản bị khóa trả `403`, đổi mật khẩu và xác thực `/me` sau khi logout trả `401` (AC-01, AC-02).

- [x] **T07: API Quản lý Giáo viên (`/api/users*`) và Cấu hình hệ thống (`/api/settings`) `[Parallel: Wave 3]`**
  - **Phụ thuộc:** `T04`, `T05`
  - **Phạm vi file dự kiến:**
    - `src/app/api/users/route.ts`
    - `src/app/api/users/[id]/route.ts`
    - `src/app/api/users/[id]/reset-password/route.ts`
    - `src/app/api/settings/route.ts`
    - `src/app/api/users/users-settings.test.ts`
  - **Mô tả triển khai:**
    - `GET /api/users` (`ADMIN`): tìm theo `q`, lọc theo `role`, `isActive`, phân trang, trả về kèm số lượng học bạ đang mượn của từng giáo viên.
    - `POST /api/users` (`ADMIN`): tạo tài khoản mới (`username` duy nhất không phân biệt hoa/thường, trả `409` nếu trùng), băm mật khẩu tạm, ghi `USER_CREATED`.
    - `PATCH /api/users/[id]` (`ADMIN`): cập nhật `fullName`, `phone`, `unit`, `isActive`; chặn tự khóa bản thân hoặc khóa/hạ quyền Admin hoạt động cuối cùng (BR-10); khi khóa (`isActive = 0`), gọi `revokeAllUserSessions(id)`; ghi `USER_UPDATED` / `USER_STATUS_CHANGED`.
    - `POST /api/users/[id]/reset-password` (`ADMIN`): đặt mật khẩu tạm mới, bật `mustChangePassword = 1`, thu hồi toàn bộ phiên của user đó, ghi `USER_PASSWORD_RESET`.
    - `GET /api/settings` (`Authenticated`): trả `defaultLoanDays`, `maxLoanDays`. `PATCH /api/settings` (`ADMIN`): cập nhật 2 giá trị, kiểm tra `defaultLoanDays <= maxLoanDays`, ghi `SETTINGS_UPDATED`.
  - **Tiêu chí hoàn thành & kiểm chứng:**
    - Chạy `npm run test -- src/app/api/users/users-settings.test.ts` pass: kiểm chứng RBAC `TEACHER` nhận `403`, chặn khóa Admin cuối cùng, khóa tài khoản thu hồi phiên ngay, đổi cấu hình hạn mượn thành công (AC-01, AC-02, AC-12).

- [x] **T08: API Phiếu mượn – trả – hủy (`/api/loans*`) `[Parallel: Wave 3]`**
  - **Phụ thuộc:** `T03`, `T04`, `T05`
  - **Phạm vi file dự kiến:**
    - `src/app/api/loans/route.ts`
    - `src/app/api/loans/[id]/return/route.ts`
    - `src/app/api/loans/[id]/cancel/route.ts`
    - `src/app/api/loans/loans-routes.test.ts`
  - **Mô tả triển khai:**
    - `GET /api/loans` (`Authenticated`):
      - Nếu `TEACHER`: ép lọc `teacherId = currentUser.id`, hỗ trợ lọc `status`, `q`, phân trang; trả kèm trường tính toán `overdueDays`, `timingLevel`, `isInRedList`.
      - Nếu `ADMIN`: xem tất cả, hỗ trợ đầy đủ bộ lọc phục vụ Danh sách mượn & Theo thời gian mượn (`q`, `status`, `overdueOnly`, `overdueTier`, `teacherId`, `schoolYear`, `className`, `borrowedFrom`, `borrowedTo`, `sort`: `borrowed_desc` | `borrowed_asc` | `overdue_desc`, `page`, `pageSize`).
    - `POST /api/loans` (**Chỉ `TEACHER`** — gọi `requireTeacher()`, trả `403` nếu `ADMIN` để thực thi BR-11 không mượn hộ):
      - Validate `className`, `studentName`, `schoolYear` (`YYYY-YYYY`), `dueDate` (`todayVN <= dueDate <= todayVN + maxLoanDays`), `borrowNote`.
      - Sinh `recordIdentityKey`; dùng transaction SQLite ghi phiếu mới kèm snapshot thông tin giáo viên (`teacher_name_snapshot`, `teacher_phone_snapshot`, `teacher_unit_snapshot`) và `LOAN_CREATED`.
      - Bắt lỗi vi phạm unique `idx_loan_active_identity` (và kiểm tra tồn tại phiếu `BORROWED`) → trả `409 Conflict` nêu rõ tên giáo viên đang giữ, ngày mượn và hạn trả.
    - `POST /api/loans/[id]/return` (`ADMIN`): chỉ áp dụng khi `status === 'BORROWED'` (nếu không trả `409`), chuyển sang `RETURNED`, lưu `returnedAt`, `returnedByAdminId`, `returnNote`, ghi `LOAN_RETURNED`.
    - `POST /api/loans/[id]/cancel` (`ADMIN`): bắt buộc `reason` (`>= 3` ký tự), chỉ áp dụng khi `status === 'BORROWED'`, chuyển sang `CANCELLED`, lưu `cancelReason`, `cancelledByAdminId`, `cancelledAt`, ghi `LOAN_CANCELLED`.
  - **Tiêu chí hoàn thành & kiểm chứng:**
    - Chạy `npm run test -- src/app/api/loans/loans-routes.test.ts` pass đủ các ca: `TEACHER` mượn thành công; `ADMIN` mượn hộ bị `403`; mượn trùng khác hoa/thường/khoảng trắng bị `409`; sai niên khóa hoặc quá `maxLoanDays` bị `400`; giáo viên A không thấy phiếu giáo viên B; giáo viên gọi `/return` hoặc `/cancel` bị `403`; Admin xác nhận trả xong thì giáo viên khác mượn lại được (AC-03..AC-05, AC-07, AC-09..AC-11, AC-14).

- [x] **T09: API Dashboard Admin (`/api/dashboard/admin`) và Nhật ký thao tác (`/api/audit-logs`) `[Parallel: Wave 3]`**
  - **Phụ thuộc:** `T03`, `T04`, `T05`
  - **Phạm vi file dự kiến:**
    - `src/app/api/dashboard/admin/route.ts`
    - `src/app/api/audit-logs/route.ts`
    - `src/app/api/dashboard/dashboard-audit.test.ts`
  - **Mô tả triển khai:**
    - `GET /api/dashboard/admin` (`ADMIN`):
      - Tính KPI theo thời gian thực tại múi giờ `Asia/Ho_Chi_Minh`: `totalBorrowed`, `overdueCount` (Danh sách đỏ), `dueSoonOrTodayCount` (`-2 <= overdueDays <= 0`), `returnedLast7Days`, `returnedThisMonth`.
      - Trả về `redList` (toàn bộ phiếu `BORROWED` có `overdueDays >= 1`, sắp xếp `overdueDays DESC`, `borrowedAt ASC`).
      - Trả về `attentionSummary` đếm số lượng theo từng nhóm mức độ (`CRITICAL >= 8`, `MODERATE 4..7`, `MILD 1..3`, `DUE_TODAY 0`, `DUE_SOON -2..-1`) và danh sách `attentionItems` phân nhóm/sắp xếp theo độ lố hạn cần lưu ý.
    - `GET /api/audit-logs` (`ADMIN`): join thông tin người thực hiện (`actorName`, `actorUsername`), lọc theo `action`, `targetType`, `q`, phân trang mới nhất trước.
  - **Tiêu chí hoàn thành & kiểm chứng:**
    - Chạy `npm run test -- src/app/api/dashboard/dashboard-audit.test.ts` pass: kiểm chứng `due_date == todayVN` KHÔNG vào `redList` mà vào nhóm đến hạn hôm nay; `due_date < todayVN` vào đúng `redList` và đúng bậc `MILD`/`MODERATE`/`CRITICAL`; `TEACHER` gọi cả 2 API bị `403` (AC-06, AC-08, AC-11, AC-13).

---

### Wave 4 — Giao diện người dùng (UI)

- [x] **T10: Bố cục dùng chung, điều hướng gốc theo vai trò, trang Đăng nhập và Đổi mật khẩu `[Sequential]`**
  - **Phụ thuộc:** `T06`
  - **Phạm vi file dự kiến:**
    - `src/app/page.tsx`
    - `src/app/login/page.tsx`
    - `src/app/doi-mat-khau/page.tsx`
    - `src/components/AppShell.tsx`
    - `src/components/StatusBadge.tsx`
    - `src/lib/format-vn.ts`
  - **Mô tả triển khai:**
    - `src/lib/format-vn.ts`: helper format ngày/giờ Việt Nam (`DD/MM/YYYY`, `DD/MM/YYYY HH:mm`) dùng thống nhất trên UI.
    - `AppShell.tsx`: thanh điều hướng tiếng Việt rõ ràng, responsive (menu gọn trên mobile cho giáo viên, sidebar/header cho Admin gồm: Tổng quan & Danh sách đỏ, Quản lý giáo viên, Cài đặt, Nhật ký), hiển thị tên người dùng, nút Đổi mật khẩu và Đăng xuất.
    - `StatusBadge.tsx`: badge trạng thái nhất quán bằng tiếng Việt (`Quá hạn X ngày - Nghiêm trọng/Vừa/Nhẹ`, `Đến hạn hôm nay`, `Sắp đến hạn`, `Trong hạn`, `Đã trả`, `Đã hủy`).
    - `src/app/page.tsx`: đọc session server-side, điều hướng sang `/admin` nếu `ADMIN`, `/giao-vien` nếu `TEACHER`, `/login` nếu chưa đăng nhập (và chuyển `/doi-mat-khau` nếu `mustChangePassword === 1`).
    - `/login` và `/doi-mat-khau`: form tiếng Việt thân thiện, hiển thị thông báo lỗi rõ ràng từ API.
  - **Tiêu chí hoàn thành & kiểm chứng:**
    - `npm run typecheck` và `npm run lint` pass; kiểm tra điều hướng đúng cho từng trạng thái phiên (`ADMIN`, `TEACHER`, chưa đăng nhập, `mustChangePassword`).

- [x] **T11: Giao diện Cổng Giáo viên (`/giao-vien`) `[Parallel: Wave 4]`**
  - **Phụ thuộc:** `T07`, `T08`, `T10`
  - **Phạm vi file dự kiến:**
    - `src/app/giao-vien/page.tsx`
    - `src/components/teacher/TeacherPortalClient.tsx`
    - `src/components/teacher/BorrowForm.tsx`
    - `src/components/teacher/TeacherLoansList.tsx`
  - **Mô tả triển khai:**
    - Bảo vệ page server-side: chỉ `TEACHER` vào được (nếu `ADMIN` thì chuyển hướng về `/admin`, chưa đăng nhập thì về `/login`).
    - `BorrowForm.tsx`: nhập `Lớp`, `Tên học sinh`, `Niên khóa` (placeholder `vd: 2025-2026`, kiểm tra nhanh định dạng `YYYY-YYYY`), `Hạn trả` (mặc định điền sẵn theo `/api/settings` `defaultLoanDays`, giới hạn chọn từ hôm nay đến `+maxLoanDays`), `Ghi chú`. Khi gặp lỗi `409 Conflict` (học bạ đang được người khác mượn), hiển thị khung cảnh báo rõ ràng ai đang giữ và hạn trả.
    - `TeacherLoansList.tsx`: 2 tab **Đang mượn** và **Lịch sử đã trả / đã hủy**, ô tìm kiếm nhanh theo lớp/học sinh/niên khóa, đánh dấu trực quan các cuốn đang trễ hạn hoặc sắp đến hạn của giáo viên; giao diện tối ưu tốt trên cả điện thoại và máy tính.
  - **Tiêu chí hoàn thành & kiểm chứng:**
    - `npm run typecheck` và `npm run lint` pass; xác minh đầy đủ luồng tạo phiếu, tự điền hạn trả mặc định và hiển thị danh sách cô lập của giáo viên.

- [x] **T12: Giao diện Dashboard Admin (`/admin`) — Danh sách đỏ & 3 góc nhìn theo dõi `[Parallel: Wave 4]`**
  - **Phụ thuộc:** `T08`, `T09`, `T10`
  - **Phạm vi file dự kiến:**
    - `src/app/admin/page.tsx`
    - `src/components/admin/AdminDashboardClient.tsx`
    - `src/components/admin/RedListPanel.tsx`
    - `src/components/admin/LoansTable.tsx`
    - `src/components/admin/ReturnCancelModals.tsx`
  - **Mô tả triển khai:**
    - Bảo vệ page server-side: chỉ `ADMIN` (nếu `TEACHER` thì chuyển về `/giao-vien`).
    - **4 thẻ KPI tổng quan** ngay đầu trang.
    - **Khối Danh sách đỏ (`RedListPanel.tsx`):** đặt ở vị trí nổi bật nhất với nền/viền cảnh báo đỏ, liệt kê toàn bộ phiếu `overdue_days >= 1`, hiển thị thông tin học bạ, họ tên + lớp/tổ + SĐT giáo viên, ngày mượn, hạn trả, số ngày quá hạn và nút **Xác nhận đã trả** nhanh.
    - **3 Tab theo dõi chi tiết (`LoansTable.tsx`):**
      1. **Danh sách mượn:** tìm kiếm đa trường, lọc theo trạng thái (`Tất cả`, `Đang mượn`, `Quá hạn`, `Đã trả`, `Đã hủy`), phân trang.
      2. **Theo thời gian mượn:** bộ lọc nhanh (`Hôm nay`, `7 ngày qua`, `30 ngày qua`, `Tháng này`, khoảng `Từ ngày – Đến ngày`) và nút đổi chiều sắp xếp (`Mới mượn trước` / `Mượn lâu nhất trước`).
      3. **Theo độ lố hạn cần lưu ý:** thanh tóm tắt + bộ lọc theo từng mức (`Nghiêm trọng >= 8 ngày`, `Vừa 4–7 ngày`, `Nhẹ 1–3 ngày`, `Đến hạn hôm nay / Sắp đến hạn`), sắp xếp mặc định từ lố hạn nặng nhất xuống nhẹ nhất.
    - **Modal Xác nhận đã trả & Hủy phiếu (`ReturnCancelModals.tsx`):** Admin nhập ghi chú trả (tùy chọn) hoặc lý do hủy (bắt buộc `>= 3` ký tự), cập nhật lại ngay KPI, Danh sách đỏ và bảng dữ liệu sau khi xác nhận.
  - **Tiêu chí hoàn thành & kiểm chứng:**
    - `npm run typecheck` và `npm run lint` pass; kiểm tra hiển thị đầy đủ Danh sách đỏ, 3 tab theo dõi và thao tác xác nhận trả / hủy phiếu.

- [x] **T13: Các trang Quản trị Admin — Quản lý Giáo viên, Cài đặt & Nhật ký `[Parallel: Wave 4]`**
  - **Phụ thuộc:** `T07`, `T09`, `T10`
  - **Phạm vi file dự kiến:**
    - `src/app/admin/giao-vien/page.tsx`
    - `src/app/admin/cai-dat/page.tsx`
    - `src/app/admin/nhat-ky/page.tsx`
    - `src/components/admin/TeacherManagerClient.tsx`
    - `src/components/admin/SettingsClient.tsx`
    - `src/components/admin/AuditLogsClient.tsx`
  - **Mô tả triển khai:**
    - `/admin/giao-vien`: bảng danh sách tài khoản, tìm kiếm/lọc hoạt động/đã khóa, modal Thêm giáo viên, modal Sửa thông tin, nút Khóa/Mở khóa (có xác nhận), modal Đặt lại mật khẩu tạm.
    - `/admin/cai-dat`: form chỉnh `default_loan_days` (mặc định 7) và `max_loan_days` (mặc định 30) với hướng dẫn rõ ràng về ràng buộc và phạm vi áp dụng cho phiếu mới.
    - `/admin/nhat-ky`: bảng phân trang nhật ký thao tác (`audit_logs`) có lọc theo loại hành động (`LOGIN_SUCCESS`, `LOAN_CREATED`, `LOAN_RETURNED`, `LOAN_CANCELLED`, `USER_*`, `SETTINGS_UPDATED`) và tìm kiếm.
  - **Tiêu chí hoàn thành & kiểm chứng:**
    - `npm run typecheck` và `npm run lint` pass; toàn bộ 3 trang đều bảo vệ quyền `ADMIN` ở server-side.

---

### Wave 5 — Đóng gói, Tài liệu vận hành & Kiểm thử tổng thể (Tuần tự)

- [x] **T14: Cấu hình Docker, tài liệu vận hành (`README.md`), cập nhật `AGENTS.md` và kiểm tra tổng thể `[Sequential]`**
  - **Phụ thuộc:** `T11`, `T12`, `T13`
  - **Phạm vi file dự kiến:**
    - `Dockerfile`, `docker-compose.yml`, `.dockerignore`
    - `README.md`
    - `AGENTS.md` (bổ sung lệnh build/test/migrate chính thức)
  - **Mô tả triển khai:**
    - Tạo `Dockerfile` multi-stage nhẹ cho Next.js + `better-sqlite3` và `docker-compose.yml` gắn volume `./data:/app/data`, cấu hình `TZ=Asia/Ho_Chi_Minh`.
    - Viết `README.md` bằng tiếng Việt hướng dẫn chi tiết cho cán bộ kỹ thuật/văn thư: cài đặt & chạy local, khởi tạo DB & tài khoản Admin lần đầu, chạy bằng Docker, và cách sao lưu/khôi phục file SQLite `./data/app.db`.
    - Cập nhật mục `Công nghệ & Lệnh vận hành` trong `AGENTS.md` dự án.
    - Chạy rà soát toàn bộ bộ kiểm tra sau chỉnh sửa cuối cùng.
  - **Tiêu chí hoàn thành & kiểm chứng:**
    - Chạy lần lượt và đạt 100% pass:
      1. `npm run lint`
      2. `npm run typecheck`
      3. `npm run test` (tất cả unit + integration tests)
      4. `npm run build` (build production Next.js thành công không lỗi)
    - *(Tùy chọn nếu môi trường cho phép)*: kiểm tra `docker compose config` hợp lệ.

---

### Wave 6 — Khắc phục sau kiểm chứng (`/validate` 2026-11-25)

- [x] **T15: Bảo mật, đồng thời & độ tin cậy Backend (`HIGH-02`, `HIGH-03`, `MEDIUM-03`, `MEDIUM-04`, `MEDIUM-05`, `MEDIUM-07`, `MEDIUM-13`) `[Sequential]`**
  - **Phạm vi file:** `.env.example`, `src/lib/env.ts`, `src/lib/auth/rate-limit.ts`, `src/lib/auth/session.ts`, `src/lib/api/response.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/loans/[id]/return/route.ts`, `src/app/api/loans/[id]/cancel/route.ts`, `src/app/api/users/[id]/route.ts`, `src/app/api/settings/route.ts` và các Route Handlers.
  - **Tiêu chí hoàn thành:** Chặn bypass rate-limit qua `X-Forwarded-For`, cập nhật nguyên tử `/return` & `/cancel` trong transaction, chống account enumeration khi login, chống lỗi `500` cookie hỏng, gộp transaction & ghi diff audit cho `PATCH /api/users/[id]` và `PATCH /api/settings`, bọc `withApiErrorHandling` cho toàn bộ API routes.

- [x] **T16: Nghiệp vụ API, phân trang & tìm kiếm tiếng Việt (`HIGH-04`, `MEDIUM-01`, `MEDIUM-02`, `MEDIUM-06`, `MEDIUM-09`, `MEDIUM-11`) `[Sequential]`**
  - **Phạm vi file:** `src/db/index.ts`, `src/lib/loans/enrich.ts`, `src/app/api/loans/route.ts`, `src/app/api/users/route.ts`, `src/app/api/audit-logs/route.ts`, `src/app/admin/page.tsx`, `src/components/admin/AdminDashboardClient.tsx`, `src/components/admin/LoansTable.tsx`, `src/components/admin/TeacherManagerClient.tsx`, `src/components/admin/AuditLogsClient.tsx`, `src/components/teacher/TeacherPortalClient.tsx`, `src/components/teacher/TeacherLoansList.tsx`, `src/components/teacher/BorrowForm.tsx`.
  - **Tiêu chí hoàn thành:** Hỗ trợ `status=HISTORY` & phân trang `pageSize=20` cho Giáo viên và Quản lý tài khoản, đăng ký hàm SQLite `vn_norm` thay full-table-scan, thêm debounce UI `300ms`, thêm bộ lọc Giáo viên/Lớp/Niên khóa trên Dashboard Admin, rút gọn `409 existingLoan` & hiển thị ngày mượn dạng `DD/MM/YYYY`, sửa `enrichLoanRows` không lọc cứng `role='ADMIN'`.

- [x] **T17: Hoàn thiện UI/UX & đóng gói Docker (`HIGH-01`, `MEDIUM-08`, `MEDIUM-10`, `MEDIUM-12`) `[Sequential]`**
  - **Phạm vi file:** `src/db/seed.ts`, `src/db/index.ts`, `Dockerfile`, `docker-compose.yml`, `README.md`, `src/components/admin/AdminDashboardClient.tsx`, `src/components/admin/TeacherManagerClient.tsx`, `src/components/teacher/BorrowForm.tsx`.
  - **Tiêu chí hoàn thành:** Tự động seed idempotent khi khởi động trên DB file thật, chạy Docker bằng user `node`, không hardcode mật khẩu mặc định trong `docker-compose.yml`, reset state modal khi đóng/đổi phiếu, thêm loading/error state trên Dashboard Admin, thay `Math.random()` bằng `crypto.getRandomValues()`, tính niên khóa gợi ý động theo năm học hiện tại.

- [x] **T18: Cập nhật & chạy kiểm thử hồi quy toàn diện `[Sequential]`**
  - **Phạm vi file:** `src/validation/acceptance.test.ts`
  - **Tiêu chí hoàn thành:** Cập nhật test `logout` theo Phương án A & `MEDIUM-02`; bổ sung test hồi quy cho `HIGH-02`, `HIGH-03`, `HIGH-04`, `MEDIUM-01`, `MEDIUM-03`, `MEDIUM-04`, `MEDIUM-05`, `MEDIUM-06`, `MEDIUM-07`; toàn bộ `vitest run`, `tsc --noEmit`, `eslint .`, `next build --webpack` đạt 100% PASS.

---

### Wave 7 — Đổi thuật ngữ "Giáo vụ" & Hỗ trợ 2 loại mượn: Cả lớp / Riêng lẻ (ADR-005, 2026-11-26)

- [x] **T19: Migration `0002`, Schema DB & backfill `class_year_key` `[Sequential]`**
  - **Phạm vi file:** `src/db/schema.ts`, `src/db/migrations/0002_loan_type_and_whole_class.sql`, `src/db/migrations/registry.ts`, `src/db/migrate.ts`
  - **Tiêu chí hoàn thành:** Thêm 3 cột `loan_type` (`DEFAULT 'INDIVIDUAL'`), `class_year_key` (`DEFAULT ''`), `quantity` (nullable) và index `idx_loan_class_year_status`; backfill `class_year_key` tự động cho dữ liệu cũ; không rebuild bảng.

- [x] **T20: Domain, Validator & API `/api/loans*` chặn trùng chéo 2 chiều `[Sequential]`**
  - **Phạm vi file:** `src/lib/domain/record-identity.ts`, `src/lib/api/validators.ts`, `src/app/api/loans/route.ts`, `src/app/api/loans/[id]/return/route.ts`, `src/app/api/loans/[id]/cancel/route.ts`
  - **Tiêu chí hoàn thành:** Hỗ trợ `loanType: 'WHOLE_CLASS' | 'INDIVIDUAL'`, `quantity` tùy chọn (`1..200`) khi mượn cả lớp, lưu `studentName = 'Toàn bộ lớp'`; kiểm tra chặn trùng chéo 2 chiều theo `class_year_key` nguyên tử trong `withWriteTransaction`; lọc `GET /api/loans?loanType=...`; ghi `loanType`/`quantity` vào `audit_logs`.

- [x] **T21: Đổi thuật ngữ "Văn thư" → "Giáo vụ" toàn hệ thống `[Parallel với T22]`**
  - **Phạm vi file:** `src/lib/env.ts`, `src/app/api/auth/login/route.ts`, `src/components/AppShell.tsx`, `src/components/ChangePasswordForm.tsx`, `src/components/admin/AdminDashboardClient.tsx`, `src/components/admin/TeacherManagerClient.tsx`, `src/components/teacher/TeacherPortalClient.tsx`, `.env.example`, `README.md`, `docs/vision/vision.md`, `docs/product/product.md`, `docs/architecture/architecture.md`
  - **Tiêu chí hoàn thành:** Không còn chữ `"Văn thư"` / `"văn thư"` trên giao diện người dùng, thông báo lỗi API hay giá trị mặc định `SEED_ADMIN_NAME`.

- [x] **T22: Giao diện 2 loại mượn cho Giáo viên & Admin (Giáo vụ) `[Sequential]`**
  - **Phạm vi file:** `src/components/teacher/BorrowForm.tsx`, `src/components/teacher/TeacherLoansList.tsx`, `src/components/admin/RedListPanel.tsx`, `src/components/admin/LoansTable.tsx`, `src/components/admin/ReturnCancelModals.tsx`
  - **Tiêu chí hoàn thành:** `BorrowForm` cho chọn *Mượn toàn bộ 1 lớp* / *Mượn riêng lẻ*, tự ẩn/hiện ô Tên học sinh & ô Số lượng tùy chọn; hiển thị badge **`Cả lớp`** (+ `X quyển`) / **`Riêng lẻ`** nhất quán trên mọi danh sách, Danh sách đỏ và modal xác nhận trả/hủy; Admin có bộ lọc `Loại mượn`.

- [x] **T23: Bổ sung kiểm thử `AC-15` & chạy kiểm chứng toàn bộ `[Sequential]`**
  - **Phạm vi file:** `src/validation/acceptance.test.ts`, `src/db/db.test.ts`
  - **Tiêu chí hoàn thành:** Test đầy đủ `WHOLE_CLASS`, chặn trùng chéo 2 chiều (tuần tự & đồng thời `Promise.all`), lọc `loanType`, migration `0002` + backfill từ DB cũ; `vitest run`, `tsc --noEmit`, `eslint .`, `next build --webpack` đạt 100% PASS.
