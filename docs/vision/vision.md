> Status: Approved (2026-11-24)

# Tầm nhìn dự án: Sổ Học Bạ — Quản Lý Mượn Trả Học Bạ Trường Tiểu Học

## 1. Tầm nhìn (Vision)

Số hóa hoàn toàn quy trình theo dõi mượn và trả học bạ giấy tại văn phòng Trường Tiểu học, giúp bộ phận Giáo vụ (Admin) nắm bắt tức thời từng cuốn học bạ hoặc cả bộ học bạ lớp đang do giáo viên nào giữ, hạn trả khi nào và phát hiện ngay các trường hợp quá hạn để kịp thời thu hồi, tránh thất lạc hồ sơ học sinh.

## 2. Vấn đề hiện tại

Tại văn phòng Trường Tiểu học, việc cho giáo viên mượn học bạ (để đối chiếu hồ sơ, làm thủ tục chuyển trường, bổ sung nhận xét, kiểm tra cuối kỳ hoặc thanh tra) thường được ghi chép thủ công trên sổ giấy hoặc file rời rạc:
- Khó tra cứu nhanh theo **Lớp**, **Tên học sinh**, **Niên khóa** hoặc theo tên **Giáo viên**.
- Không có cảnh báo trực quan khi phiếu mượn đã quá hạn trả, dễ dẫn đến tình trạng mượn kéo dài nhiều tuần mà Giáo vụ không nhớ để nhắc.
- Dễ xảy ra nhầm lẫn hoặc mượn trùng khi học bạ thực tế đang nằm ở một giáo viên khác nhưng chưa trả về văn phòng.
- Khó tổng hợp danh sách theo thứ tự thời gian mượn hoặc lọc riêng nhóm học bạ quá hạn nặng cần xử lý ưu tiên.

## 3. Nguyên tắc cốt lõi

1. **Đơn giản, thực dụng cho văn phòng tiểu học:** Giao diện tiếng Việt hoàn toàn, ít thao tác, giáo viên chỉ cần nhập thông tin định danh học bạ (`Lớp + Tên học sinh + Niên khóa`) và ngày hẹn trả là tạo được phiếu ngay mà không cần chờ nhập liệu trước toàn bộ hồ sơ học sinh của cả trường.
2. **Chặt chẽ về nghiệp vụ và trách nhiệm:**
   - Lưu đầy đủ thông tin giáo viên mượn và thời điểm mượn.
   - Chặn mượn trùng một bộ học bạ đang ở trạng thái chưa trả.
   - Chỉ Admin (Giáo vụ) có quyền xác nhận đã nhận lại học bạ giấy để đóng phiếu mượn.
   - Không xóa cứng lịch sử mượn trả; mọi tác vụ quan trọng đều có nhật ký kiểm toán (`audit_logs`).
3. **Cảnh báo quá hạn trực quan (Danh sách đỏ):** Mọi học bạ lố hạn trả (`>= 1` ngày) được làm nổi bật ngay trên Dashboard Admin thành **Danh sách đỏ** và phân mức theo độ lố hạn để Giáo vụ ưu tiên liên hệ thu hồi.
4. **Triển khai cloud gọn nhẹ, không cần cài đặt trên máy trường:** Triển khai ứng dụng web trực tiếp trên **Vercel** và lưu trữ cơ sở dữ liệu trên **Turso (libSQL)**, giúp Giáo vụ và giáo viên truy cập ngay qua trình duyệt mà không cần cài đặt Docker hay duy trì máy chủ nội bộ tại trường.

## 4. Tiêu chí thành công cho bản MVP

- Giáo viên đăng nhập và hoàn tất tạo phiếu mượn học bạ trong dưới 30 giây.
- Hệ thống chặn 100% trường hợp mượn trùng bộ học bạ đang chưa được Admin xác nhận trả.
- Dashboard Admin hiển thị tức thời:
  - **Danh sách đỏ** các học bạ lố hạn trả.
  - **Danh sách mượn đầy đủ** (lọc, tìm kiếm theo học sinh/lớp/niên khóa/giáo viên/trạng thái).
  - **Danh sách theo thời gian mượn** (theo dõi dòng chảy mượn trả theo ngày/khoảng thời gian).
  - **Danh sách theo độ lố hạn cần lưu ý** (xếp hạng từ lố hạn nhiều ngày nhất, chia mức độ cảnh báo rõ ràng, kèm số điện thoại giáo viên để Giáo vụ gọi nhắc ngay).
- Quy trình trả học bạ đảm bảo chỉ Admin xác nhận trả mới kết thúc phiếu.

## 5. Định hướng mở rộng sau MVP

Sau khi hệ thống vận hành ổn định trong nhà trường, có thể cân nhắc mở rộng ở các phiên bản sau:
- Nhập danh mục học sinh từ file Excel theo từng năm học để gợi ý tự động khi chọn học bạ.
- Xuất báo cáo thống kê mượn – trả định kỳ ra file Excel/PDF phục vụ lưu trữ Giáo vụ.
- Gửi thông báo nhắc hạn tự động qua Zalo OA hoặc Email.
- In và quét mã QR dán bìa cặp học bạ.
