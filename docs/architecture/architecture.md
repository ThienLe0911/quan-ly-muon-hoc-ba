> Status: Approved (2026-11-26)

# Kiến trúc hệ thống (Architecture) — `quan-ly-hoc-ba`

> **Lưu ý SPDD:** Các lựa chọn công nghệ, cơ chế xác thực và quy tắc định danh/quá hạn trong tài liệu này đã được chủ dự án phê duyệt theo các ADR `Accepted` ([`002`](decisions/002-co-che-xac-thuc-va-phan-quyen.md), [`003`](decisions/003-dinh-danh-hoc-ba-va-quy-tac-qua-han.md), [`004`](decisions/004-trien-khai-vercel-va-co-so-du-lieu-turso.md) thay thế [`001`](decisions/001-tech-stack-va-co-so-du-lieu.md), và [`005`](decisions/005-bo-sung-loai-muon-ca-lop-va-chan-trung-cheo.md)).

---

## 1. Tổng quan kiến trúc hệ thống

Hệ thống được thiết kế theo mô hình **Full-stack Next.js Serverless trên Vercel + Turso (libSQL)**:
- **Frontend & Backend API:** Next.js (App Router, TypeScript), triển khai trực tiếp trên **Vercel**, phục vụ cả giao diện người dùng (React Server Components / Client Components + Tailwind CSS) và REST-like JSON Route Handlers (`/api/*`).
- **Cơ sở dữ liệu:** **Turso (libSQL — tương thích SQLite)** truy cập qua `@libsql/client` + `drizzle-orm/libsql` (`async/await`), bật kiểm tra khóa ngoại (`PRAGMA foreign_keys = ON`). Khi phát triển cục bộ không cần mạng, driver tự hỗ trợ file SQLite (`file:./data/app.db`) và test tự động dùng `file::memory:`.
- **Tính không trạng thái của thời gian (No Background Cron Needed):** Độ lố hạn được tính trực tiếp từ ngày lịch hiện tại (`Asia/Ho_Chi_Minh`) so với `due_date`, không cần background worker hay cron job riêng.

```
[Trình duyệt Giáo viên / Admin]
        │ (HTTPS + Cookie HttpOnly Session)
        ▼
[Vercel — Next.js App Router + Route Handlers (/api/*)]
   ├── Middleware & Auth Guard (kiểm tra session + RBAC + DB rate-limit)
   ├── Domain Services (Chuẩn hóa định danh & tìm kiếm VN, tính quá hạn VN, Audit Log)
   └── Drizzle ORM (libsql) + @libsql/client
        ▼ (HTTPS / libSQL)
[Turso Cloud Database (libSQL / SQLite)]
(Local dev fallback: file:./data/app.db)
```

---

## 2. Thiết kế cơ sở dữ liệu (SQLite Schema đề xuất)

### 2.1. Bảng `users` (Tài khoản Admin & Giáo viên)
| Cột | Kiểu SQLite | Ràng buộc | Mô tả |
| --- | --- | --- | --- |
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | ID tài khoản |
| `username` | `TEXT` | `NOT NULL UNIQUE` | Tên đăng nhập (chuẩn hóa lowercase, không dấu cách) |
| `password_hash` | `TEXT` | `NOT NULL` | Chuỗi băm mật khẩu (`scrypt`: `salt:hash`) |
| `full_name` | `TEXT` | `NOT NULL` | Họ và tên giáo viên / giáo vụ |
| `role` | `TEXT` | `NOT NULL CHECK(role IN ('ADMIN','TEACHER'))` | Vai trò người dùng |
| `phone` | `TEXT` | `NULL` | Số điện thoại liên hệ khi cần nhắc trả |
| `unit` | `TEXT` | `NULL` | Lớp chủ nhiệm hoặc Tổ chuyên môn (vd: `3A`, `Tổ 4-5`, `Văn phòng`) |
| `is_active` | `INTEGER` | `NOT NULL DEFAULT 1` | `1`: hoạt động, `0`: bị khóa |
| `must_change_password` | `INTEGER` | `NOT NULL DEFAULT 0` | `1`: yêu cầu đổi mật khẩu lần đầu/sau khi reset |
| `search_text` | `TEXT` | `NOT NULL DEFAULT ''` | Chuỗi tìm kiếm tiếng Việt không dấu/chữ thường (`full_name`, `username`, `phone`, `unit`) tính khi ghi |
| `created_at` | `TEXT` | `NOT NULL` | Thời điểm tạo (ISO-8601 UTC) |
| `updated_at` | `TEXT` | `NOT NULL` | Thời điểm cập nhật (ISO-8601 UTC) |

### 2.2. Bảng `sessions` (Phiên đăng nhập)
| Cột | Kiểu SQLite | Ràng buộc | Mô tả |
| --- | --- | --- | --- |
| `id` | `TEXT` | `PRIMARY KEY` | SHA-256 hash của session token thô |
| `user_id` | `INTEGER` | `NOT NULL REFERENCES users(id) ON DELETE CASCADE` | Chủ sở hữu phiên |
| `expires_at` | `TEXT` | `NOT NULL` | Thời điểm hết hạn phiên (ISO-8601 UTC) |
| `created_at` | `TEXT` | `NOT NULL` | Thời điểm đăng nhập (ISO-8601 UTC) |

### 2.3. Bảng `loan_records` (Phiếu mượn – trả học bạ)
| Cột | Kiểu SQLite | Ràng buộc | Mô tả |
| --- | --- | --- | --- |
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | Mã phiếu mượn |
| `teacher_id` | `INTEGER` | `NOT NULL REFERENCES users(id)` | ID giáo viên mượn học bạ |
| `teacher_name_snapshot` | `TEXT` | `NOT NULL` | Họ tên giáo viên tại thời điểm mượn |
| `teacher_phone_snapshot` | `TEXT` | `NULL` | SĐT giáo viên tại thời điểm mượn |
| `teacher_unit_snapshot` | `TEXT` | `NULL` | Lớp/Tổ chuyên môn giáo viên tại thời điểm mượn |
| `loan_type` | `TEXT` | `NOT NULL DEFAULT 'INDIVIDUAL' CHECK(loan_type IN ('INDIVIDUAL','WHOLE_CLASS'))` | Loại mượn: `INDIVIDUAL` (riêng lẻ) hoặc `WHOLE_CLASS` (toàn bộ 1 lớp) |
| `class_name` | `TEXT` | `NOT NULL` | Tên lớp học sinh (vd: `3A`) |
| `student_name` | `TEXT` | `NOT NULL` | Họ tên học sinh (`INDIVIDUAL`) hoặc nhãn `"Toàn bộ lớp"` (`WHOLE_CLASS`) |
| `school_year` | `TEXT` | `NOT NULL` | Niên khóa học bạ (vd: `2025-2026`) |
| `quantity` | `INTEGER` | `NULL` | Số lượng quyển học bạ (tùy chọn `1..200`, áp dụng cho `WHOLE_CLASS`) |
| `record_identity_key` | `TEXT` | `NOT NULL` | Khóa chuẩn hóa chống mượn trùng (`class\|student\|school_year` hoặc `class:class\|school_year`) |
| `class_year_key` | `TEXT` | `NOT NULL DEFAULT ''` | Khóa chuẩn hóa theo lớp + niên khóa (`normClass\|normSchoolYear`) phục vụ chặn trùng chéo 2 chiều |
| `class_name_norm` | `TEXT` | `NOT NULL DEFAULT ''` | Tên lớp chuẩn hóa không dấu/chữ thường phục vụ lọc lớp trên Turso |
| `search_text` | `TEXT` | `NOT NULL DEFAULT ''` | Chuỗi tìm kiếm không dấu/chữ thường (`student_name`, `class_name`, `school_year`, `teacher_name_snapshot`, `teacher_unit_snapshot`, `teacher_phone_snapshot`) |
| `borrowed_at` | `TEXT` | `NOT NULL` | Thời điểm mượn chính xác (ISO-8601 UTC) |
| `due_date` | `TEXT` | `NOT NULL` | Hạn ngày trả (`YYYY-MM-DD`, theo lịch VN) |
| `returned_at` | `TEXT` | `NULL` | Thời điểm Admin xác nhận đã trả (ISO-8601 UTC) |
| `returned_by_admin_id` | `INTEGER` | `NULL REFERENCES users(id)` | Admin xác nhận nhận lại học bạ |
| `return_note` | `TEXT` | `NULL` | Ghi chú khi trả (vd: `Đủ bìa, nguyên vẹn`) |
| `status` | `TEXT` | `NOT NULL CHECK(status IN ('BORROWED','RETURNED','CANCELLED'))` | Trạng thái lưu trữ của phiếu |
| `borrow_note` | `TEXT` | `NULL` | Lý do / ghi chú khi mượn |
| `cancel_reason` | `TEXT` | `NULL` | Lý do hủy phiếu (chỉ khi `CANCELLED`) |
| `cancelled_by_admin_id` | `INTEGER` | `NULL REFERENCES users(id)` | Admin thực hiện hủy phiếu |
| `cancelled_at` | `TEXT` | `NULL` | Thời điểm hủy phiếu (ISO-8601 UTC) |
| `created_at` | `TEXT` | `NOT NULL` | Thời điểm tạo bản ghi |
| `updated_at` | `TEXT` | `NOT NULL` | Thời điểm cập nhật bản ghi |

**Các chỉ mục (Indexes) bắt buộc trên `loan_records`:**
- **Chống mượn trùng tuyệt đối ở tầng DB:**
  ```sql
  CREATE UNIQUE INDEX idx_loan_active_identity
  ON loan_records(record_identity_key)
  WHERE status = 'BORROWED';
  ```
- Truy vấn danh sách quá hạn & sắp đến hạn:
  ```sql
  CREATE INDEX idx_loan_status_due_date ON loan_records(status, due_date);
  ```
- Truy vấn danh sách theo thời gian mượn:
  ```sql
  CREATE INDEX idx_loan_borrowed_at ON loan_records(borrowed_at DESC);
  ```
- Truy vấn phiếu theo giáo viên:
  ```sql
  CREATE INDEX idx_loan_teacher_status ON loan_records(teacher_id, status);
  ```
- Kiểm tra chặn trùng chéo 2 chiều theo Lớp + Niên khóa:
  ```sql
  CREATE INDEX idx_loan_class_year_status ON loan_records(class_year_key, status);
  ```

### 2.4. Bảng `system_settings` (Cấu hình hệ thống)
| Cột | Kiểu SQLite | Ràng buộc | Mô tả |
| --- | --- | --- | --- |
| `key` | `TEXT` | `PRIMARY KEY` | Tên khóa cấu hình |
| `value` | `TEXT` | `NOT NULL` | Giá trị dạng chuỗi |
| `updated_at` | `TEXT` | `NOT NULL` | Thời điểm cập nhật |
| `updated_by_admin_id` | `INTEGER` | `NULL REFERENCES users(id)` | Admin cập nhật gần nhất |

Khóa mặc định khởi tạo khi seed:
- `default_loan_days`: `"7"` (hạn mượn mặc định tính bằng ngày lịch).
- `max_loan_days`: `"30"` (số ngày tối đa được phép hẹn trả kể từ ngày mượn).

### 2.5. Bảng `audit_logs` (Nhật ký thao tác kiểm toán)
| Cột | Kiểu SQLite | Ràng buộc | Mô tả |
| --- | --- | --- | --- |
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | Mã log |
| `actor_id` | `INTEGER` | `NULL REFERENCES users(id)` | Người thực hiện thao tác |
| `action` | `TEXT` | `NOT NULL` | Mã hành động (vd: `LOGIN_SUCCESS`, `LOAN_CREATED`, `LOAN_RETURNED`) |
| `target_type` | `TEXT` | `NOT NULL` | Loại đối tượng (`USER`, `LOAN`, `SETTING`, `AUTH`) |
| `target_id` | `TEXT` | `NULL` | ID đối tượng tác động |
| `metadata_json` | `TEXT` | `NULL` | Dữ liệu ngữ cảnh JSON (trước/sau hoặc lý do) |
| `search_text` | `TEXT` | `NOT NULL DEFAULT ''` | Chuỗi tìm kiếm không dấu/chữ thường (`action`, `target_id`, `metadata_json`, tên/username actor) |
| `created_at` | `TEXT` | `NOT NULL` | Thời điểm phát sinh (ISO-8601 UTC) |

### 2.6. Bảng `login_rate_limits` (Chống brute-force đăng nhập trên Serverless)
| Cột | Kiểu SQLite | Ràng buộc | Mô tả |
| --- | --- | --- | --- |
| `key` | `TEXT` | `PRIMARY KEY` | Khóa bucket (`ip:<ip>\|<username>` hoặc `user:<username>`) |
| `failures` | `INTEGER` | `NOT NULL DEFAULT 0` | Số lần đăng nhập thất bại trong cửa sổ thời gian |
| `reset_at` | `INTEGER` | `NOT NULL` | Mốc hết hạn cửa sổ tính theo epoch ms |

---

## 3. Quy tắc ngày giờ, chuẩn hóa định danh và tính độ lố hạn

### 3.1. Chuẩn hóa định danh học bạ (`record_identity_key`) và khóa lớp–niên khóa (`class_year_key`)
Để tránh trường hợp cùng một học bạ hoặc cùng một lớp nhưng giáo viên gõ khác hoa/thường hoặc dư khoảng trắng:
- Mỗi thành phần (`class_name`, `student_name`, `school_year`) được:
  1. Chuẩn hóa Unicode về dạng `NFC`.
  2. Cắt khoảng trắng đầu/cuối (`trim`) và gộp nhiều khoảng trắng liên tiếp thành 1 khoảng trắng.
  3. Với `school_year`, chuẩn hóa dấu gạch nối dài (`–`, `—`, `−`) thành `-` và bỏ khoảng trắng quanh `-` (vd: `2025 - 2026` → `2025-2026`).
  4. Chuyển sang chữ thường theo locale tiếng Việt (`toLocaleLowerCase('vi-VN')`).
- Khóa định danh và chống trùng chéo (ADR-005):
  - `class_year_key`: `${normClass}|${normSchoolYear}` (dùng để kiểm tra xung đột chéo 2 chiều giữa mượn cả lớp và mượn riêng lẻ).
  - `record_identity_key` với `INDIVIDUAL`: `${normClass}|${normStudent}|${normSchoolYear}`.
  - `record_identity_key` với `WHOLE_CLASS`: `class:${normClass}|${normSchoolYear}` (`student_name` hiển thị mặc định là `"Toàn bộ lớp"`).
- Dữ liệu hiển thị cho người dùng giữ nguyên phần đã cắt/gộp khoảng trắng gọn gàng (`displayValue`).

### 3.2. Tính toán hạn trả & độ lố hạn theo giờ Việt Nam (`Asia/Ho_Chi_Minh`)
- Ngày hiện tại `todayVN` được xác định theo múi giờ `Asia/Ho_Chi_Minh` ở định dạng `YYYY-MM-DD`.
- Với mỗi phiếu có `status = 'BORROWED'`:
  - `overdue_days = diffCalendarDays(todayVN, due_date)` (số ngày `todayVN` lớn hơn `due_date`).
  - `overdue_days >= 1`: Phiếu **Quá hạn** → Bắt buộc xuất hiện trong **Danh sách đỏ** trên Dashboard Admin.
- Phân nhóm mức độ cảnh báo (tính động ở server):
  - `CRITICAL` (**Quá hạn nghiêm trọng**): `overdue_days >= 8`
  - `MODERATE` (**Quá hạn vừa**): `4 <= overdue_days <= 7`
  - `MILD` (**Quá hạn nhẹ**): `1 <= overdue_days <= 3`
  - `DUE_TODAY` (**Đến hạn hôm nay**): `overdue_days == 0`
  - `DUE_SOON` (**Sắp đến hạn**): `-2 <= overdue_days <= -1` (còn 1–2 ngày)
  - `ON_TIME` (**Trong hạn**): `overdue_days <= -3`

---

## 4. Chuẩn API Contract (`/api/*`)

### 4.1. Quy ước Response thống nhất
- **Thành công (`200`, `201`):**
  ```json
  {
    "data": {},
    "meta": { "total": 100, "page": 1, "pageSize": 20 }
  }
  ```
- **Lỗi (`400`, `401`, `403`, `404`, `409`, `429`, `500`):**
  ```json
  {
    "error": {
      "code": "DUPLICATE_ACTIVE_LOAN",
      "message": "Học bạ này hiện đang được giáo viên khác mượn và chưa trả.",
      "details": {}
    }
  }
  ```

### 4.2. Danh sách Endpoints MVP
| Nhóm | Method & Path | Quyền | Mô tả |
| --- | --- | --- | --- |
| Auth | `POST /api/auth/login` | Public | Đăng nhập, cấp cookie session `HttpOnly` |
| Auth | `POST /api/auth/logout` | Public / Authenticated | Hủy session trong DB (nếu có) và xóa cookie phiên theo cơ chế idempotent (`200`) |
| Auth | `GET /api/auth/me` | Authenticated | Lấy thông tin người dùng hiện tại |
| Auth | `POST /api/auth/change-password` | Authenticated | Đổi mật khẩu của chính mình |
| Users | `GET /api/users` | `ADMIN` | Danh sách tài khoản (lọc theo role, active, tìm kiếm) |
| Users | `POST /api/users` | `ADMIN` | Tạo tài khoản giáo viên / admin mới |
| Users | `PATCH /api/users/[id]` | `ADMIN` | Cập nhật thông tin hoặc khóa/mở khóa tài khoản |
| Users | `POST /api/users/[id]/reset-password` | `ADMIN` | Đặt lại mật khẩu tạm và thu hồi phiên cũ |
| Loans | `GET /api/loans` | Authenticated | Giáo viên chỉ xem phiếu của mình; Admin xem tất cả với bộ lọc đa chiều |
| Loans | `POST /api/loans` | `TEACHER` | Tạo phiếu mượn mới — chỉ giáo viên tự mượn cho bản thân, không mượn hộ; chặn trùng qua `idx_loan_active_identity` |
| Loans | `POST /api/loans/[id]/return` | `ADMIN` | Xác nhận đã thu hồi học bạ (`BORROWED` → `RETURNED`) |
| Loans | `POST /api/loans/[id]/cancel` | `ADMIN` | Hủy phiếu nhập nhầm (`BORROWED` → `CANCELLED`, bắt buộc có lý do) |
| Dashboard | `GET /api/dashboard/admin` | `ADMIN` | Trả về KPI tổng quan, Danh sách đỏ quá hạn và phân nhóm độ lố hạn |
| Settings | `GET /api/settings` | Authenticated | Đọc cấu hình `default_loan_days`, `max_loan_days` |
| Settings | `PATCH /api/settings` | `ADMIN` | Cập nhật cấu hình hạn mượn |
| Audit | `GET /api/audit-logs` | `ADMIN` | Xem nhật ký thao tác hệ thống (phân trang, lọc theo action/actor) |

---

## 5. Bảo mật & Audit Logging

1. **Xác thực & Phiên:**
   - Token phiên tạo bằng `crypto.randomBytes(32).toString('hex')`, chỉ lưu bản băm SHA-256 vào DB.
   - Cookie gắn cờ `HttpOnly`, `SameSite=Lax`, `Path=/`, và `Secure` khi chạy HTTPS.
   - Khi tài khoản bị vô hiệu hóa (`is_active = 0`) hoặc bị reset mật khẩu, xóa ngay toàn bộ `sessions` của `user_id` đó.
2. **Mật khẩu:**
   - Băm bằng `crypto.scrypt` với salt 16-byte ngẫu nhiên cho mỗi người dùng; kiểm tra bằng `crypto.timingSafeEqual`.
3. **Phân quyền (RBAC):**
   - Mọi Route Handler bắt buộc gọi helper kiểm tra phiên và vai trò ở phía server (`requireAuth()`, `requireAdmin()`). Không tin tưởng dữ liệu role gửi từ client.
   - Giáo viên gọi `GET /api/loans` luôn bị ép lọc `teacher_id = currentUser.id`.
4. **Kiểm tra dữ liệu & Chống lạm dụng:**
   - Toàn bộ request body và query params được validate bằng `zod`.
   - Áp dụng rate-limit bền vững trên Turso (`login_rate_limits`) cho `/api/auth/login` theo cả cặp `IP + username` và bucket `username` (tạm khóa ngắn nếu sai liên tiếp nhiều lần, duy trì hiệu lực qua mọi Vercel Serverless instance).
5. **Audit Logging:**
   - Ghi nhận tối thiểu các hành động: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, `PASSWORD_CHANGED`, `USER_CREATED`, `USER_UPDATED`, `USER_STATUS_CHANGED`, `USER_PASSWORD_RESET`, `LOAN_CREATED`, `LOAN_RETURNED`, `LOAN_CANCELLED`, `SETTINGS_UPDATED`.

---

## 6. Triển khai & Sao lưu (Deployment & Backup)

- **Triển khai Production (Vercel + Turso):**
  - Tạo cơ sở dữ liệu trên **Turso** (`libsql://<db-name>-<org>.turso.io`) và cấp Auth Token.
  - Kết nối mã nguồn lên **Vercel** (Next.js App Router chuẩn, không cần Docker hay máy chủ nội bộ tại trường).
- **Biến môi trường:**
  - `TURSO_DATABASE_URL`: URL cơ sở dữ liệu Turso (`libsql://...` hoặc `https://...`). Nếu để trống ở môi trường phát triển cục bộ, hệ thống tự fallback sang `file:./data/app.db` (hoặc `DATABASE_PATH` nếu được truyền).
  - `TURSO_AUTH_TOKEN`: Token xác thực Turso (bắt buộc khi kết nối Turso từ xa; không cần cho file cục bộ).
  - `TZ=Asia/Ho_Chi_Minh`.
  - `AUTH_COOKIE_SECURE`: mặc định tự động `true` khi chạy trên Vercel (`VERCEL=1`) và `false` khi chạy `localhost`.
  - `TRUST_PROXY`: mặc định tự động `true` khi chạy trên Vercel (`VERCEL=1`) để đọc `X-Forwarded-For` tin cậy từ edge proxy của Vercel; mặc định `false` khi chạy cục bộ.
  - Thông tin khởi tạo Admin đầu tiên (idempotent): `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`, `SEED_ADMIN_MUST_CHANGE_PASSWORD`.
- **Khởi tạo tự động:** Khi ứng dụng khởi chạy lần đầu trên một DB mới (Turso hoặc file cục bộ), hệ thống tự động chạy migration SQL (`0000`, `0001`, ...) và khởi tạo cấu hình mặc định + tài khoản Admin đầu tiên theo cơ chế idempotent (chỉ tạo nếu chưa có Admin nào). Quản trị viên cũng có thể chạy chủ động `npm run db:migrate && npm run db:seed`.
- **Sao lưu dữ liệu:** Turso cung cấp cơ chế sao lưu/snapshot tự động trên cloud (Point-in-Time Recovery / dump qua `turso db shell <db> .dump`). Không còn phụ thuộc vào ổ đĩa máy tính văn phòng.
