> Status: Conditional Fail — Vòng 2 (2026-11-25) — 0 BLOCKER, 0 HIGH, 64/64 tests PASS; còn 1 bug hồi quy UI treo loading (`MEDIUM-R2-01`) và 3 mục `MEDIUM` nhỏ

# Báo cáo Kiểm chứng (Validation) Vòng 2: Quản lý Mượn – Trả Học Bạ (`quan-ly-muon-tra-hoc-ba`)

- **Ngày kiểm chứng vòng 2:** 2026-11-25 (kiểm chứng lại sau khi khắc phục 4 `HIGH`, 13 `MEDIUM` và chốt Phương án A cho `POST /api/auth/logout` của vòng 1)
- **Nguồn chân lý đối chiếu:** [`spec.md`](spec.md) (`Approved`), [`tasks.md`](tasks.md) (`Implemented` — gồm Wave 6 `T15`–`T18`), [`architecture.md`](../../architecture/architecture.md) (`Approved`), ADR [`001`](../../architecture/decisions/001-tech-stack-va-co-so-du-lieu.md) / [`002`](../../architecture/decisions/002-co-che-xac-thuc-va-phan-quyen.md) / [`003`](../../architecture/decisions/003-dinh-danh-hoc-ba-va-quy-tac-qua-han.md) (`Accepted`), [`AGENTS.md`](../../../AGENTS.md).
- **Phương pháp thực hiện:** 2 subagent độc lập mới hoàn toàn cho Vòng 2:
  - **Reviewer Vòng 2 (chỉ đọc):** xác minh từng mục `HIGH-01..04`, `MEDIUM-01..13`, Phương án A `logout`, và rà soát hồi quy toàn bộ mã nguồn `src/` + Docker.
  - **QA Vòng 2 (chỉ sửa file test):** viết bổ sung 18 test hồi quy tại `src/validation/regression-round2.test.ts` (SQLite `:memory:`, không sửa mã nguồn sản phẩm, không cài dependency mới) và chạy toàn bộ bộ kiểm thử.

---

## 1. Tóm tắt kết quả Vòng 2

| Hạng mục | Kết quả Vòng 1 | Kết quả Vòng 2 | Chi tiết |
| --- | --- | --- | --- |
| **Test tự động (`vitest run`)** | 41/42 PASS · 1 FAIL | **64/64 PASS · 0 FAIL** | 10/10 file test PASS (8 file test gốc: 20 tests, `acceptance.test.ts`: 26 tests, `regression-round2.test.ts`: 18 tests mới). |
| **TypeScript (`tsc --noEmit`)** | PASS | **PASS** | 0 lỗi kiểu. |
| **Lint (`eslint .`)** | PASS | **PASS** | 0 lỗi, 0 cảnh báo. |
| **Production Build (`next build --webpack`)** | PASS | **PASS** | Biên dịch thành công toàn bộ 8 trang app (11 static/dynamic routes) + 13 API Route Handlers. |
| **QA Độc lập** | FAIL (1 test logout) | **PASS** | 14/14 AC, 11/11 BR, 100% Permissions & hồi quy backend đạt. |
| **Code Review Độc lập** | 0 BLOCKER · 4 HIGH · 13 MEDIUM · 9 LOW | **0 BLOCKER · 0 HIGH · 4 MEDIUM · 5 LOW mới** | 4/4 `HIGH` & 12/13 `MEDIUM` vòng 1 đã khắc phục hoàn toàn (`MEDIUM-10` khắc phục một phần); phát hiện 1 bug hồi quy UI treo loading (`MEDIUM-R2-01`) và 3 mục `MEDIUM` nhỏ. |
| **Kết luận nghiệm thu** | Conditional Fail | **Conditional Fail (còn 4 MEDIUM nhẹ)** | Toàn bộ backend, bảo mật, nghiệp vụ & spec đã đạt sạch (`0 BLOCKER`, `0 HIGH`, `0 lệch spec`); nên sửa nhanh 4 mục `MEDIUM` trước khi chốt `Validated`. |

---

## 2. Bảng xác minh khắc phục Vòng 1

| Mã vòng 1 | Trạng thái vòng 2 | Bằng chứng xác minh chính (`file:dòng`) |
| --- | --- | --- |
| **HIGH-01** | **ĐÃ KHẮC PHỤC *(lưu ý Docker Linux `MEDIUM-R2-02`)*** | `src/db/index.ts:51-58` tự gọi `seedDatabase(conn.db)` idempotent cho DB file; `Dockerfile:21-26` copy `migrations` và chuyển sang `USER node`; `README.md:41-48` cập nhật hướng dẫn Docker. |
| **HIGH-02** | **ĐÃ KHẮC PHỤC** | `src/lib/env.ts:27` mặc định `trustProxy=false`; `src/lib/auth/rate-limit.ts:9,11,24-54` thêm bucket `username` (`15` lần), `pruneStore` & giới hạn `10_000`; `login/route.ts` áp dụng đủ 2 bucket. |
| **HIGH-03** | **ĐÃ KHẮC PHỤC** | `return/route.ts:53-95` và `cancel/route.ts:39-80` cập nhật nguyên tử `WHERE id = ? AND status = 'BORROWED'` + `writeAuditLog` trong cùng `db.transaction`; QA test `Promise.all` đồng thời PASS. |
| **HIGH-04** | **ĐÃ KHẮC PHỤC *(phát sinh `MEDIUM-R2-01`)*** | `loans/route.ts:77-78,181-202` hỗ trợ `status=HISTORY` + phân trang DB + `meta.teacherSummary`; `TeacherPortalClient.tsx` & `TeacherLoansList.tsx` dùng `pageSize=20`. *(Xem lỗi click lại tab `MEDIUM-R2-01`).* |
| **MEDIUM-01** | **ĐÃ KHẮC PHỤC** | `admin/page.tsx:25-34` + `LoansTable.tsx:259-308` đủ bộ lọc Giáo viên/Lớp/Niên khóa + Xóa bộ lọc; API dùng `vn_norm` + `escapeLikePattern`. |
| **MEDIUM-02** | **ĐÃ KHẮC PHỤC** | `loans/route.ts:27-39,274-279,327-336` chỉ trả `{ teacherNameSnapshot, borrowedAt, dueDate }` và format `DD/MM/YYYY` đủ ngày mượn & hạn trả; `BorrowForm.tsx` hiển thị đầy đủ; khớp `spec.md:89`. |
| **MEDIUM-03** | **ĐÃ KHẮC PHỤC** | `login/route.ts:68-97` kiểm tra `verifyPassword` trước `isActive !== 1` (sai mật khẩu trả `401`, đúng mật khẩu nhưng bị khóa trả `403` + ghi rate-limit). |
| **MEDIUM-04** | **ĐÃ KHẮC PHỤC** | `session.ts:36-41,54` bọc `try/catch` cho `decodeURIComponent` + kiểm regex hex 64 ký tự. |
| **MEDIUM-05** | **ĐÃ KHẮC PHỤC** | `users/[id]/route.ts:38-148` & `settings/route.ts:37-88` bọc transaction và ghi đủ diff `before`/`after` trong `audit_logs`. |
| **MEDIUM-06** | **ĐÃ KHẮC PHỤC** | `src/lib/loans/enrich.ts:18-35` truy vấn `inArray(users.id, ...)` không lọc cứng `role='ADMIN'`. |
| **MEDIUM-07** | **ĐÃ KHẮC PHỤC** | `src/lib/api/response.ts:46-58` chỉ khớp `SQLITE_CONSTRAINT_UNIQUE` / `UNIQUE constraint failed` (đệ quy `cause <= 3` cấp). |
| **MEDIUM-08** | **ĐÃ KHẮC PHỤC** | `AdminDashboardClient.tsx:173-196,216-228` tách loading/error/retry và reset modal qua `key`. |
| **MEDIUM-09** | **ĐÃ KHẮC PHỤC** | `src/db/index.ts:35-38` đăng ký hàm SQLite `vn_norm`; 3 API `/loans`, `/users`, `/audit-logs` lọc & phân trang ngay trong SQLite; 4 màn hình UI debounce `300ms`. |
| **MEDIUM-10** | **MỘT PHẦN** | Đã thay `Math.random()` bằng `crypto.getRandomValues` (`TeacherManagerClient.tsx:113-122`) và bật `SEED_ADMIN_MUST_CHANGE_PASSWORD=true`, nhưng `docker-compose.yml:14` vẫn còn fallback `:-Admin@123456`. |
| **MEDIUM-11** | **ĐÃ KHẮC PHỤC** | `TeacherManagerClient.tsx:72-73,434-457` dùng `pageSize=20` và có thanh phân trang server. |
| **MEDIUM-12** | **ĐÃ KHẮC PHỤC** | `BorrowForm.tsx:17-24` tính niên khóa gợi ý động theo `minDueDate`. |
| **MEDIUM-13** | **ĐÃ KHẮC PHỤC** | `withApiErrorHandling` (`response.ts:60-75`) đã bọc đủ 13/13 Route Handlers (16/16 handlers). |
| **Phương án A (`LOGOUT`)** | **ĐÃ KHẮC PHỤC** | `spec.md:175` & `architecture.md:177` đồng bộ `POST /api/auth/logout` idempotent `200` + xóa cookie; QA test PASS. |

---

## 3. Ma trận đối chiếu Vòng 2 (`FR`, `BR`, `Permissions`, `AC`)

- **Business Rules (`BR-01..BR-11`):** **11/11 ĐẠT**.
- **Ma trận phân quyền (`Permissions`):** **100% ĐẠT** (bao gồm Phương án A `POST /api/auth/logout` idempotent `200`, `POST /api/loans` chỉ `TEACHER`, các endpoint quản trị chỉ `ADMIN`).
- **Tiêu chí chấp nhận (`AC-01..AC-14`):** **14/14 ĐẠT** trên bộ 64/64 test PASS (`acceptance.test.ts` + `regression-round2.test.ts` + 8 test suites gốc).
- **Yêu cầu chức năng (`FR-01..FR-12`):**
  - **Đạt hoàn toàn:** `FR-01`, `FR-02` *(lưu ý `MEDIUM-R2-03`)*, `FR-03`, `FR-04`, `FR-05`, `FR-07`, `FR-11`, `FR-12`.
  - **Cần sửa lỗi UI hồi quy (`MEDIUM-R2-01` & `MEDIUM-R2-03`):** `FR-06`, `FR-08`, `FR-09`, `FR-10` (logic API & phân trang đạt 100%, nhưng click lại vào tab đang mở ở trang 1 trên `TeacherPortalClient` hoặc `LoansTable` bị treo `"Đang tải..."`).

---

## 4. Các phát hiện tồn đọng & hồi quy ở Vòng 2

### BLOCKER (0) · HIGH (0)
Không có.

### MEDIUM (4)

1. **`MEDIUM-R2-01` (Hồi quy mới từ T16 — ưu tiên sửa ngay) — Click lại vào tab đang mở ở trang 1 gây treo vĩnh viễn `"Đang tải..."`**
   - **Vị trí:** `src/components/teacher/TeacherPortalClient.tsx:81-85`, `src/components/admin/LoansTable.tsx:154-158`.
   - **Mô tả:** `handleTabChange(nextTab)` gọi `setLoading(true)` ngay cả khi `nextTab === activeTab` (hoặc `tab`) và `page === 1`. Do state `tab` và `page` không đổi giá trị, `useEffect` không chạy lại nên `setLoading(false)` không bao giờ được gọi.
   - **Khuyến nghị sửa:** Thêm `if (nextTab === activeTab && page === 1) return;` (hoặc chuyển `setLoading(true)` vào đầu `useEffect` ngay trước `fetch` và bỏ ở các handler đổi tab/trang).

2. **`MEDIUM-R2-02` (Hồi quy mới từ T17) — Bind mount `./data:/app/data` với `USER node` có nguy cơ `EACCES` trên Docker Linux**
   - **Vị trí:** `Dockerfile:21-26`, `docker-compose.yml:17-18`, `README.md:41-48`.
   - **Mô tả:** Nếu thư mục `./data` chưa tồn tại trước khi chạy `docker compose up` trên máy chủ Linux, Docker tạo `./data` thuộc `root:root` (`0755`), làm user `node` (UID `1000`) trong container không ghi được `./data/app.db`.
   - **Khuyến nghị sửa:** Dùng named volume Docker mặc định (hoặc bổ sung hướng dẫn bắt buộc `mkdir -p ./data && chown -R 1000:1000 ./data` trong `README.md` trước khi chạy Docker trên Linux).

3. **`MEDIUM-10` (Tồn dư từ vòng 1) — Vẫn còn fallback mật khẩu mặc định `Admin@123456` trong `docker-compose.yml`**
   - **Vị trí:** `docker-compose.yml:14`.
   - **Mô tả:** Dòng `SEED_ADMIN_PASSWORD=${SEED_ADMIN_PASSWORD:-Admin@123456}` vẫn chứa giá trị fallback mật khẩu công khai trong repo.
   - **Khuyến nghị sửa:** Đổi thành `${SEED_ADMIN_PASSWORD:?Vui lòng đặt biến môi trường SEED_ADMIN_PASSWORD}` trong `docker-compose.yml` (hoặc tài liệu hóa rõ ràng nếu giữ fallback cho dev/demo).

4. **`MEDIUM-R2-03` (Thiếu sót mới rà soát ở T16) — 4 màn hình danh sách thiếu `catch` & trạng thái lỗi khi gọi API**
   - **Vị trí:** `src/components/teacher/TeacherPortalClient.tsx:55-74`, `src/components/admin/LoansTable.tsx:122-134`, `src/components/admin/TeacherManagerClient.tsx:77-89`, `src/components/admin/AuditLogsClient.tsx:60-72`.
   - **Mô tả:** Cả 4 `useEffect` chỉ dùng `try { ... } finally { ... }`, không có `catch` và không xử lý `!res.ok`, nên lỗi mạng/`500` sẽ gây Unhandled Rejection và hiển thị nhầm thông báo danh sách trống.
   - **Khuyến nghị sửa:** Thêm `catch` + state `error` hiển thị banner lỗi kèm nút *Thử lại*.

### LOW mới (5) & `LOW` cũ giữ lại làm backlog
- **`LOW-R2-01`:** `src/db/index.ts:54-56` tự gọi `seedDatabase()` khiến CLI `npm run db:migrate` vô tình seed luôn Admin và `npm run db:seed` lần đầu luôn in *"Tài khoản Admin đã tồn tại"*. *(Nên tách CLI `migrate.ts`/`seed.ts` dùng `createDbConnection()` trực tiếp và đóng DB).*
- **`LOW-R2-02`:** `seedDatabase()` (`src/db/seed.ts:24-48`) nên bọc `db.transaction` + `.onConflictDoNothing()` khi insert Admin.
- **`LOW-R2-03`:** `pruneStore()` (`rate-limit.ts:30-34`) dùng FIFO eviction có thể đẩy sớm bucket username nếu bị spam >10.000 key rác.
- **`LOW-R2-04`:** `src/app/api/loans/route.ts:69` nên kiểm `/^\d+$/` cho `teacherIdParam` giống `actorId`.
- **`LOW-R2-05`:** `src/app/admin/page.tsx:25-34` lọc `role='TEACHER'` cho dropdown lọc giáo viên.
- *Các `LOW` vòng 1 không chặn:* `LOW-02`, `LOW-03`, `LOW-05`, `LOW-06`, `LOW-07`, `LOW-08`, `LOW-09`.

---

## 5. Bước tiếp theo

Khắc phục nhanh **4 mục `MEDIUM` nêu trên** (`MEDIUM-R2-01`, `MEDIUM-R2-02`, `MEDIUM-10`, `MEDIUM-R2-03`), chạy kiểm tra lại `vitest`, `tsc`, `eslint`, `build` và xác nhận lần cuối để chuyển trạng thái feature sang **`Validated`**.
