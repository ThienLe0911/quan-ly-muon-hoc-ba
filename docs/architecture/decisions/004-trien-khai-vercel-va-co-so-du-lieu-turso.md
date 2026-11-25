# ADR 004: Triển khai trên Vercel và chuyển cơ sở dữ liệu sang Turso (libSQL)

- Status: Accepted <!-- chủ dự án duyệt trong chat ngày 2026-11-25 -->
- Date: 2026-11-25
- Người đề xuất: PM (Antigravity)
- Thay thế: [ADR 001](001-tech-stack-va-co-so-du-lieu.md)

## Context

Chủ dự án yêu cầu thay đổi mô hình triển khai của hệ thống **Quản Lý Mượn Trả Học Bạ Tiểu Học**:
- **Không dùng Docker** và không cài phần mềm host trên máy tính văn phòng của trường.
- **Triển khai ứng dụng web lên Vercel** (Serverless Next.js) và **lưu cơ sở dữ liệu trên Turso** (dịch vụ cloud tương thích SQLite / libSQL).

Việc chuyển từ `better-sqlite3` (file SQLite cục bộ trên ổ đĩa) + Docker sang **Vercel + Turso** tác động trực tiếp đến kiến trúc ở 5 điểm kỹ thuật:
1. **Driver & mô hình đồng bộ → bất đồng bộ:** `better-sqlite3` là native C++ module đồng bộ chạy trên file cục bộ, không tương thích với Vercel Serverless (filesystem chỉ đọc / tạm thời) và không kết nối được Turso qua mạng. Cần chuyển sang `@libsql/client` kết hợp `drizzle-orm/libsql` — toàn bộ truy vấn DB chuyển sang `async/await` (ảnh hưởng tầng DB, Auth, Audit, Settings, Enrich, 13 API Route Handlers, Server Components và bộ test).
2. **Hàm SQLite UDF `vn_norm()` không khả dụng trên Turso từ xa:** Hiện tại tìm kiếm tiếng Việt không dấu đang đăng ký JS UDF `sqlite.function('vn_norm', ...)` trong process Node.js. Khi kết nối Turso qua HTTP/libSQL, máy chủ Turso không hỗ trợ đăng ký JS UDF từ client.
3. **Rate-limit đăng nhập trên môi trường Serverless:** Bộ đếm `Map` trong RAM hiện tại sẽ mất trạng thái khi Vercel cold start hoặc chạy song song nhiều instance Serverless.
4. **Cấu hình môi trường Vercel:** Khi chạy trên Vercel (`process.env.VERCEL === '1'`), lưu lượng luôn đi qua reverse proxy HTTPS, cần tự động mặc định `AUTH_COOKIE_SECURE=true` và `TRUST_PROXY=true`; cấu hình kết nối DB qua `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (giữ fallback `file:./data/app.db` cho môi trường dev cục bộ).
5. **Gỡ bỏ đóng gói Docker:** Xóa `Dockerfile`, `docker-compose.yml`, `.dockerignore` và bỏ `output: 'standalone'`, `serverExternalPackages: ['better-sqlite3']` trong `next.config.ts` (đồng thời loại bỏ triệt để 2 ghi nhận `MEDIUM-R2-02` và `MEDIUM-10` liên quan đến Docker ở Vòng 2).

## Options

1. **Vercel + Drizzle ORM (`drizzle-orm/libsql`) + `@libsql/client` + cột chuẩn hóa tìm kiếm (`search_text`, `class_name_norm`) + bảng `login_rate_limits` trên Turso *(Đề xuất)***
   - *Ưu điểm:*
     - Giữ nguyên dialect SQLite, schema cốt lõi và **Partial Unique Index** (`idx_loan_active_identity WHERE status = 'BORROWED'`) chống mượn trùng.
     - Tính trước chuỗi không dấu/chữ thường ở tầng ứng dụng khi ghi vào cột `search_text` (`loan_records`, `users`, `audit_logs`) và `class_name_norm` (`loan_records`), giúp giữ tìm kiếm không dấu + phân trang `LIMIT/OFFSET` hoàn toàn bằng SQL trên Turso mà không phải tải toàn bảng về Serverless.
     - Lưu trạng thái chống brute-force đăng nhập vào bảng `login_rate_limits` gọn nhẹ trên chính Turso, bền vững qua cold start / multi-instance mà không cần thêm dịch vụ thứ ba (như Redis/Upstash).
     - Môi trường dev cục bộ vẫn chạy offline được với `file:./data/app.db` và bộ test Vitest vẫn chạy nhanh với `file::memory:` qua cùng driver `@libsql/client`.
   - *Nhược điểm:*
     - Cần refactor các hàm DB, nghiệp vụ, API route và test từ đồng bộ sang `async/await`.
     - Thêm 1 file migration SQL (`0001_turso_search_and_ratelimit.sql`) để bổ sung cột chuẩn hóa tìm kiếm (kèm backfill cho dữ liệu sẵn có nếu chạy trên DB cũ) và bảng `login_rate_limits`.
     - Mỗi lượt đăng nhập thất bại phát sinh 1 truy vấn nhẹ lên Turso (chấp nhận được với quy mô trường Tiểu học).

2. **Vercel + Drizzle ORM (`drizzle-orm/libsql`) + `@libsql/client` KHÔNG thay đổi schema (lọc tiếng Việt bằng JS trên Serverless + giữ rate-limit trong RAM)**
   - *Ưu điểm:* Không cần thêm migration hay cột/bảng mới trong DB.
   - *Nhược điểm:* Khi tìm kiếm hoặc lọc theo lớp phải tải toàn bộ bản ghi từ Turso về Serverless rồi lọc và cắt trang bằng JS (tăng độ trễ, tốn đọc dòng trên Turso khi dữ liệu tăng); rate-limit trong RAM giảm hiệu lực khi Vercel mở nhiều instance hoặc ngủ đông.

3. **Vercel + chuyển toàn bộ CSDL sang PostgreSQL (Neon / Supabase) + `drizzle-orm/pg-core`**
   - *Ưu điểm:* PostgreSQL có sẵn extension `unaccent` cho tìm kiếm tiếng Việt và hệ sinh thái cloud phổ biến.
   - *Nhược điểm:* Phải viết lại toàn bộ schema, migration SQL và truy vấn từ SQLite sang PostgreSQL; đi ngược định hướng dùng Turso của chủ dự án; bộ test tự động không còn chạy in-memory nhẹ cùng dialect SQLite.

## Decision

Chọn **Phương án 1: Vercel + Drizzle ORM (`drizzle-orm/libsql`) + `@libsql/client` + cột chuẩn hóa tìm kiếm (`search_text`, `class_name_norm`) + bảng `login_rate_limits` trên Turso** theo phê duyệt của chủ dự án ngày `2026-11-25`. Giải pháp đáp ứng nhu cầu triển khai cloud không cần cài đặt phần mềm host trên máy tính của trường, giữ nguyên dialect SQLite cùng Partial Unique Index `idx_loan_active_identity`, duy trì tìm kiếm tiếng Việt không dấu/phân trang SQL native và rate-limit bền vững trên môi trường Vercel Serverless.

## Consequences

Các thay đổi được triển khai đồng bộ:
- Đánh dấu [ADR 001](001-tech-stack-va-co-so-du-lieu.md) là `Superseded by 004` (không chỉnh sửa nội dung quyết định cũ của ADR 001) và cập nhật `docs/architecture/decisions/README.md`.
- Đồng bộ tài liệu dự án (cần sự chấp thuận của chủ dự án):
  - `docs/architecture/architecture.md` (mô hình triển khai Vercel + Turso, driver `@libsql/client`, cột chuẩn hóa tìm kiếm, bảng `login_rate_limits`, biến môi trường mới).
  - `docs/vision/vision.md` và `docs/product/product.md` (cập nhật định hướng triển khai cloud miễn cài đặt trên máy trường).
  - `AGENTS.md`, `README.md`, `.env.example` (hướng dẫn tạo DB Turso, cấu hình biến môi trường trên Vercel, gỡ hướng dẫn Docker).
- Thay đổi dependency (cần sự chấp thuận của chủ dự án): cài `@libsql/client`, gỡ `better-sqlite3` và `@types/better-sqlite3`.
- Gỡ bỏ các tệp Docker (`Dockerfile`, `docker-compose.yml`, `.dockerignore`) và cấu hình `output: 'standalone'` / `serverExternalPackages: ['better-sqlite3']` trong `next.config.ts`.
- Triển khai refactor `async/await` cho tầng DB/Auth/API/UI Server Components/Tests, thêm migration `0001_turso_search_and_ratelimit.sql`, hỗ trợ tự khởi tạo migration + tài khoản Admin đầu tiên trên Turso an toàn (idempotent), sau đó chạy kiểm chứng lại toàn bộ hệ thống.
