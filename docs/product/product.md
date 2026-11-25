> Status: Approved (2026-11-24)

# Tài liệu sản phẩm (Product Overview) — Quản Lý Mượn Trả Học Bạ

## 1. Đối tượng sử dụng (Personas)

### 1.1. Admin (Nhân viên văn thư / Quản trị văn phòng)
- **Mục tiêu:** Kiểm soát toàn bộ học bạ đang lưu hành ngoài kho văn phòng, phát hiện nhanh hồ sơ quá hạn và xác nhận thu hồi đúng sổ giấy.
- **Nhu cầu chính:**
  - Tạo, chỉnh sửa, khóa/mở khóa và đặt lại mật khẩu cho tài khoản giáo viên.
  - Cấu hình số ngày mượn mặc định của trường (ví dụ: 7 ngày).
  - Xem **Dashboard Admin** với **Danh sách đỏ** các học bạ quá hạn nổi bật ngay đầu trang.
  - Theo dõi linh hoạt 3 góc nhìn: Danh sách mượn tổng hợp, Danh sách theo thời gian mượn, và Danh sách theo độ lố hạn cần lưu ý.
  - Bấm xác nhận trả học bạ khi giáo viên mang sổ trả lại văn phòng; hủy phiếu khi phát hiện nhập nhầm.
  - Tra cứu nhật ký thao tác (`audit_logs`) khi cần đối soát trách nhiệm.

### 1.2. Giáo viên
- **Mục tiêu:** Mượn học bạ nhanh khi cần xử lý hồ sơ lớp/học sinh và theo dõi các bộ mình đang giữ để trả đúng hạn.
- **Nhu cầu chính:**
  - Đăng nhập bằng tài khoản được văn thư cấp.
  - Tạo phiếu mượn bằng cách nhập `Lớp`, `Tên học sinh`, `Niên khóa`, ngày hẹn trả (hệ thống gợi ý sẵn theo cấu hình trường, có thể chỉnh trong giới hạn cho phép) và ghi chú lý do mượn.
  - Xem danh sách học bạ mình đang mượn (nhận biết rõ cuốn nào sắp đến hạn hoặc đã quá hạn) và lịch sử các cuốn đã trả.

## 2. Phạm vi sản phẩm MVP

Để đảm bảo hệ thống đơn giản, tập trung và dễ bảo trì cho môi trường Trường Tiểu học, toàn bộ chức năng MVP được tổ chức thành một feature lõi duy nhất:
- [`docs/features/quan-ly-muon-tra-hoc-ba/spec.md`](../features/quan-ly-muon-tra-hoc-ba/spec.md)

Lý do gom gọn vào một feature lõi: các thực thể (`users`, `loan_records`, `system_settings`, `audit_logs`) và luồng nghiệp vụ (mượn học bạ → tính quá hạn → cảnh báo danh sách đỏ → xác nhận trả) liên kết trực tiếp với nhau trên cùng một vòng đời phiếu mượn.

## 3. Hành trình người dùng cốt lõi (Core User Flows)

1. **Khởi tạo & Đăng nhập:**
   - Hệ thống khởi tạo sẵn 1 tài khoản Admin ban đầu.
   - Admin tạo tài khoản cho từng giáo viên (gồm `Họ tên`, `Tên đăng nhập`, `SĐT`, `Lớp/Tổ chuyên môn`, `Mật khẩu tạm`).
   - Giáo viên đăng nhập, đổi mật khẩu (nếu được yêu cầu) và vào trang mượn học bạ.
2. **Mượn học bạ:**
   - Giáo viên mở form **Mượn học bạ**, nhập `Lớp`, `Tên học sinh`, `Niên khóa`, xem/chỉnh `Hạn trả` và nhập ghi chú (nếu có).
   - Hệ thống chuẩn hóa khóa định danh học bạ; nếu học bạ này đang có phiếu ở trạng thái `BORROWED`, hệ thống chặn mượn trùng và thông báo rõ ai đang giữ.
   - Nếu hợp lệ, hệ thống tự động gắn thông tin giáo viên (snapshot họ tên, SĐT, lớp/tổ chuyên môn) và thời điểm mượn hiện tại (`borrowed_at`).
3. **Theo dõi & Cảnh báo quá hạn:**
   - Khi ngày hiện tại theo giờ Việt Nam (`Asia/Ho_Chi_Minh`) vượt quá `due_date` từ 1 ngày trở lên (`overdue_days >= 1`) và phiếu vẫn ở trạng thái `BORROWED`, phiếu tự động hiển thị trong **Danh sách đỏ** trên Dashboard Admin.
   - Dashboard Admin cung cấp các góc nhìn chuyên biệt:
     - **Danh sách đỏ quá hạn** (cảnh báo nổi bật).
     - **Danh sách mượn** (tất cả hoặc lọc theo trạng thái).
     - **Theo thời gian mượn** (sắp xếp mới nhất/cũ nhất, lọc khoảng ngày mượn).
     - **Theo độ lố hạn cần lưu ý** (ưu tiên người trễ nhiều ngày nhất, chia nhóm mức độ: Nghiêm trọng `>= 8` ngày, Vừa `4–7` ngày, Nhẹ `1–3` ngày, kèm nhóm Sắp đến hạn để chủ động nhắc trước).
4. **Trả học bạ:**
   - Giáo viên mang học bạ giấy trả trực tiếp cho văn thư.
   - Admin tìm phiếu đang mượn, đối chiếu đúng `Lớp + Tên học sinh + Niên khóa`, bấm **Xác nhận đã trả** (có thể thêm ghi chú tình trạng sổ).
   - Phiếu chuyển sang trạng thái `RETURNED`, rời khỏi Danh sách đỏ và giải phóng khóa định danh để lần sau có thể mượn lại.

## 4. Roadmap ngoài phạm vi MVP (Chưa làm ở v1)

Các tính năng dưới đây được ghi nhận cho giai đoạn sau khi MVP chạy ổn định, không đưa vào v1 để giữ dự án gọn nhẹ:
- Import/Export danh sách học sinh và báo cáo Excel/PDF hàng loạt.
- Gửi nhắc nhở tự động qua Zalo OA, SMS hoặc Email.
- Quản lý kho hồ sơ học sinh toàn trường trước khi phát sinh mượn.
- Tạo phiếu gia hạn riêng hoặc quét mã vạch/QR.
