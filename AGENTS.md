# Quản Lý Mượn Trả Học Bạ Tiểu Học (`quan-ly-hoc-ba`)

> Tài liệu hướng dẫn cấp dự án, bổ sung cho `AGENTS.md` toàn cục. Khi có xung đột về đường dẫn hoặc quy ước kỹ thuật trong phạm vi dự án này, ưu tiên quy định tại file này.

## Nguồn chân lý (SPDD)

Code KHÔNG phải nguồn chân lý. Thứ tự ưu tiên tuyệt đối:
1. `docs/vision/*`
2. `docs/architecture/*` và `docs/architecture/decisions/*`
3. `docs/product/*`
4. `docs/features/*/spec.md`
5. `docs/features/*/tasks.md`
6. `docs/features/*/validation.md`

## Quy tắc làm việc bắt buộc

- **Luôn giao tiếp và viết tài liệu nghiệp vụ/giao diện bằng tiếng Việt.**
- **Múi giờ nghiệp vụ chuẩn:** `Asia/Ho_Chi_Minh` (UTC+7). Mọi ngày hạn trả và tính toán quá hạn phải căn cứ theo ngày lịch Việt Nam.
- **Không sửa code mù:** Trước khi chỉnh sửa symbol/module đã tồn tại, phải tìm kiếm toàn bộ nơi tham chiếu (`rg`/`grep`) và báo cáo blast radius.
- **Cập nhật spec trước khi sửa code:** Mọi thay đổi nghiệp vụ phải được cập nhật vào `spec.md` (và được chủ dự án duyệt) trước khi sửa mã nguồn.
- **Quy tắc duyệt:** Không tự động chuyển `Draft`/`Proposed` thành `Approved`/`Accepted`. Chỉ triển khai code sau khi `spec.md`, `tasks.md` và các ADR liên quan đã được chủ dự án duyệt.

## Bảo vệ kiến trúc (Architecture Protection)

Không thay đổi các thành phần sau nếu chưa có sự đồng ý rõ ràng (hoặc ADR mới được `Accepted`) từ chủ dự án:
- **Luồng xác thực (Authentication & Session):** Cơ chế phiên đăng nhập (`sessions` + cookie `HttpOnly`), hàm băm mật khẩu và kiểm tra phân quyền (`ADMIN` / `TEACHER`) ở tầng API.
- **Quy ước cơ sở dữ liệu (libSQL/SQLite Schema & Indexes):** Cấu trúc bảng `users`, `sessions`, `loan_records`, `system_settings`, `audit_logs`, `login_rate_limits`, các cột chuẩn hóa tìm kiếm (`search_text`, `class_name_norm`) và Partial Unique Index chống mượn trùng (`idx_loan_active_identity`).
- **Chuẩn API Contract (`/api/*`):** Định dạng response thống nhất `{ data, meta? }` và `{ error: { code, message, details? } }`.
- **Hành vi Audit Logging (`audit_logs`):** Không bỏ qua việc ghi nhật ký cho các thao tác đăng nhập, quản lý tài khoản, tạo/trả/hủy phiếu mượn và đổi cấu hình hệ thống.
- **Quy tắc tính quá hạn:** Mọi phiếu `BORROWED` có `due_date < todayVN` (lố `>= 1` ngày lịch) đều thuộc Danh sách đỏ trên Dashboard Admin.

## Công nghệ & Lệnh vận hành (Build / Test / Run)

- **Stack chính thức (theo ADR-002/003/004 `Accepted`, thay thế ADR-001):** Next.js (App Router, TypeScript) + Tailwind CSS + Drizzle ORM (`drizzle-orm/libsql`) + `@libsql/client` (Turso cloud trên Vercel; hỗ trợ fallback file SQLite cục bộ `file:./data/app.db` khi phát triển và `file::memory:` khi chạy test), giữ nguyên Partial Unique Index `idx_loan_active_identity`.
- **Xác thực & Phiên:** Session DB (`sessions`) + Cookie `HttpOnly` (`hb_session`) + mật khẩu băm `node:crypto` (`scrypt`) + rate-limit bền vững qua bảng `login_rate_limits` + RBAC (`ADMIN`, `TEACHER`).
- **Lệnh vận hành & kiểm chứng chuẩn:**
  - Khởi tạo/cập nhật DB: `npm run db:migrate` và `npm run db:seed`
  - Kiểm tra kiểu TypeScript: `npm run typecheck`
  - Kiểm tra ESLint: `npm run lint`
  - Chạy toàn bộ unit & integration test (Vitest): `npm run test`
  - Build production: `npm run build`
  - Chạy dev / production: `npm run dev` / `npm run start`
