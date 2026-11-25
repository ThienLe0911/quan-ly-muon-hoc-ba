# Sổ Học Bạ — Quản Lý Mượn Trả Học Bạ Trường Tiểu Học

Ứng dụng web gọn nhẹ phục vụ văn phòng Trường Tiểu học quản lý việc mượn – trả học bạ giữa **Giáo viên** và **Admin (Văn thư)**, tự động cảnh báo **Danh sách đỏ quá hạn** và lưu vết nhật ký thao tác. Triển khai trực tiếp trên **Vercel** với cơ sở dữ liệu cloud **Turso (libSQL)** — không cần cài đặt Docker hay phần mềm máy chủ trên máy tính của trường.

## Tính năng chính

- **Vai trò Giáo viên (`/giao-vien`):**
  - Tự tạo phiếu mượn học bạ định danh bằng `Lớp + Tên học sinh + Niên khóa` (`YYYY-YYYY`).
  - Tự động lưu thông tin giáo viên mượn, ngày giờ mượn và gợi ý hạn trả mặc định (có thể chọn hạn trả khác trong giới hạn cho phép).
  - Chặn mượn trùng nếu học bạ đang được giáo viên khác mượn chưa trả.
  - Theo dõi danh sách học bạ đang mượn và lịch sử đã trả của chính mình (phân trang phía server).
- **Vai trò Admin / Văn thư (`/admin`):**
  - **KPI tổng quan & Danh sách đỏ quá hạn:** tự động liệt kê các hồ sơ lố hạn trả từ 1 ngày trở lên, sắp xếp theo mức độ khẩn cấp.
  - **3 góc nhìn theo dõi:** Danh sách mượn đầy đủ (lọc theo trạng thái, giáo viên, lớp, niên khóa) · Danh sách theo thời gian mượn · Danh sách theo độ lố hạn cần lưu ý (Nghiêm trọng `≥ 8` ngày, Vừa `4–7` ngày, Nhẹ `1–3` ngày, Đến hạn hôm nay, Sắp đến hạn).
  - **Chỉ Admin được xác nhận đã trả** học bạ hoặc hủy phiếu nhập nhầm.
  - Quản lý tài khoản giáo viên (`/admin/giao-vien`), cấu hình hạn mượn (`/admin/cai-dat`) và xem nhật ký thao tác (`/admin/nhat-ky`).

## Triển khai trên Vercel + Turso (Khuyến nghị cho trường học)

### Bước 1: Tạo cơ sở dữ liệu trên Turso
1. Đăng ký tài khoản miễn phí tại [turso.tech](https://turso.tech) và tạo 1 database (ví dụ: `quan-ly-hoc-ba`, chọn region gần Việt Nam như Singapore `sin`).
2. Lấy 2 thông tin kết nối từ trang quản trị Turso (hoặc CLI `turso db show` / `turso db tokens create`):
   - `TURSO_DATABASE_URL` (dạng `libsql://quan-ly-hoc-ba-<org>.turso.io`)
   - `TURSO_AUTH_TOKEN`

### Bước 2: Deploy lên Vercel
1. Đẩy thư mục dự án lên GitHub/GitLab/Bitbucket và Import Project vào [vercel.com](https://vercel.com) (nếu repo chứa nhiều thư mục, đặt **Root Directory** là `quan-ly-hoc-ba`).
2. Trong mục **Settings → Environment Variables** trên Vercel, khai báo các biến sau:
   - `TURSO_DATABASE_URL` = URL database Turso ở Bước 1
   - `TURSO_AUTH_TOKEN` = Token database Turso ở Bước 1
   - `TZ` = `Asia/Ho_Chi_Minh`
   - `SEED_ADMIN_USERNAME` = `admin` (hoặc tên đăng nhập văn thư mong muốn)
   - `SEED_ADMIN_PASSWORD` = *(đặt mật khẩu mạnh riêng của nhà trường)*
   - `SEED_ADMIN_NAME` = `Văn thư nhà trường`
   - `SEED_ADMIN_MUST_CHANGE_PASSWORD` = `true` (nên bật để buộc đổi mật khẩu ở lần đăng nhập đầu)
   - *(Lưu ý: Trên Vercel, `AUTH_COOKIE_SECURE` và `TRUST_PROXY` tự động bật `true`, không cần cấu hình thêm).*
3. Bấm **Deploy**. Ở lần truy cập đầu tiên (hoặc khi chạy `npm run db:migrate && npm run db:seed` trỏ vào Turso), hệ thống tự động khởi tạo bảng, chỉ mục và tài khoản Admin ban đầu theo cơ chế idempotent.

## Chạy phát triển cục bộ (Local)

Khi không đặt `TURSO_DATABASE_URL`, ứng dụng tự động dùng file SQLite cục bộ `file:./data/app.db` nên có thể phát triển và thử nghiệm hoàn toàn offline:

1. Sao chép file cấu hình mẫu:
   ```bash
   cp .env.example .env
   ```
2. Cài đặt gói phụ thuộc:
   ```bash
   npm install
   ```
3. Khởi tạo cơ sở dữ liệu và tài khoản Admin mặc định (từ lần truy cập ứng dụng đầu tiên cũng tự chạy idempotent):
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
4. Chạy môi trường phát triển hoặc production:
   ```bash
   npm run dev
   # Hoặc build & chạy production:
   npm run build && npm run start
   ```
5. Mở trình duyệt tại `http://localhost:3000`. Thông tin tài khoản Admin seed mặc định xem trong [`.env.example`](.env.example).

## Sao lưu dữ liệu trên Turso

- Turso hỗ trợ sao lưu và khôi phục trực tiếp trên cloud Dashboard.
- Có thể xuất bản sao lưu SQL bất cứ lúc nào bằng Turso CLI:
  ```bash
  turso db shell quan-ly-hoc-ba .dump > backup-hoc-ba.sql
  ```

## Kiểm thử chất lượng

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
