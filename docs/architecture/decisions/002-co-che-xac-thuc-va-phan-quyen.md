# ADR 002: Cơ chế xác thực phiên và phân quyền Admin / Giáo viên

- Status: Accepted <!-- chủ dự án duyệt trong chat ngày 2026-11-24 -->
- Date: 2026-11-24
- Người đề xuất: PM (Antigravity)

## Context

Hệ thống có 2 nhóm người dùng với quyền hạn khác biệt rõ rệt:
- **Admin (Văn thư):** Quản lý tài khoản giáo viên, xem toàn bộ dữ liệu và Danh sách đỏ quá hạn, xác nhận trả học bạ, hủy phiếu, đổi cấu hình hạn mượn, xem audit log.
- **Giáo viên:** Tạo phiếu mượn học bạ và xem lịch sử mượn trả của chính mình.

Admin là người cấp và quản lý tài khoản giáo viên. Khi một giáo viên nghỉ việc, chuyển công tác hoặc bị nghi ngờ lộ mật khẩu, Admin phải **khóa tài khoản (`is_active = 0`) hoặc đặt lại mật khẩu**, và mọi phiên đăng nhập cũ của giáo viên đó phải mất hiệu lực ngay lập tức. Đồng thời cần giảm tối đa dependency bên ngoài và tránh rò rỉ thông tin qua client storage.

## Options

1. **Session lưu trong SQLite (`sessions`) + Cookie `HttpOnly` + mật khẩu băm bằng `node:crypto` (`scrypt`) (Đề xuất)**
   - *Ưu điểm:* Thu hồi phiên đăng nhập tức thì (xóa dòng trong `sessions` khi khóa tài khoản, đổi mật khẩu hoặc đăng xuất); không cần thêm thư viện auth hay native `bcrypt`; cookie `HttpOnly` chống đọc token từ JavaScript (XSS).
   - *Nhược điểm:* Mỗi request cần 1 truy vấn SQLite đọc bảng `sessions` join `users` (tuy nhiên với SQLite local theo primary key thì chi phí dưới 1ms, không đáng kể ở quy mô trường học).
2. **Stateless JWT lưu trong Cookie `HttpOnly`**
   - *Ưu điểm:* Không cần bảng `sessions`.
   - *Nhược điểm:* Không thể thu hồi ngay token đang còn hạn nếu không duy trì blacklist/version check trong DB (lúc đó lại quay về tốn truy vấn DB như session).
3. **Dùng thư viện Auth.js (NextAuth) với Credentials Provider**
   - *Ưu điểm:* Có sẵn khung cấu hình chuẩn.
   - *Nhược điểm:* Thêm nhiều dependency, cấu hình phức tạp khi kết hợp Credentials + SQLite + thu hồi phiên tức thì, dư thừa so với ứng dụng nội bộ 2 vai trò.

## Decision

Chọn **Phương án 1: Session lưu trong SQLite (`sessions`) + Cookie `HttpOnly` + mật khẩu băm bằng `node:crypto` (`scrypt`)** theo phê duyệt của chủ dự án ngày `2026-11-24`, giúp thu hồi phiên đăng nhập tức thì khi khóa tài khoản hoặc đặt lại mật khẩu và hạn chế phụ thuộc thư viện ngoài.

## Consequences

_(Cập nhật chính thức khi Decision được chọn; dự kiến theo Phương án 1 nếu được duyệt)_:
- Cơ sở dữ liệu có bảng `sessions` lưu `id` (SHA-256 của session token), `user_id`, `expires_at`.
- Toàn bộ API Handler và Server Component được bảo vệ bằng lớp kiểm tra phiên + vai trò ở phía server (`requireAuth`, `requireAdmin`).
- Cần quy định cờ `AUTH_COOKIE_SECURE` cấu hình theo môi trường (bật `true` khi deploy HTTPS; có thể cấu hình `false` khi chạy HTTP trong mạng LAN nội bộ trường học để trình duyệt cho phép lưu cookie).
- Cần cơ chế seed tài khoản Admin mặc định cho lần khởi động đầu tiên.
