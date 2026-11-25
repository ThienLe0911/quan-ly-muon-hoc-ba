# ADR 003: Định danh học bạ tự nhập, chống mượn trùng và quy tắc tính quá hạn

- Status: Accepted <!-- chủ dự án duyệt trong chat ngày 2026-11-24 -->
- Date: 2026-11-24
- Người đề xuất: PM (Antigravity)

## Context

Trong MVP, trường chưa nạp sẵn danh sách học sinh; giáo viên tự nhập thông tin định danh học bạ khi mượn gồm 3 trường: **Lớp + Tên học sinh + Niên khóa**. Nghiệp vụ yêu cầu:
1. Một cuốn học bạ đang được mượn (chưa được Admin xác nhận trả) thì **không ai được mượn trùng**; sau khi Admin xác nhận trả xong thì lần sau có thể mượn lại.
2. Thông tin giáo viên mượn phải được giữ nguyên lịch sử ngay cả khi sau này giáo viên đổi lớp/tổ hoặc đổi SĐT.
3. Hệ thống phải hiển thị chính xác **Danh sách đỏ** và **độ lố hạn (số ngày quá hạn)** trên Dashboard Admin ngay cả khi ứng dụng chạy nội bộ trên máy văn phòng không bật 24/7.

## Options

1. **Chuẩn hóa khóa định danh `record_identity_key` + Partial Unique Index (`WHERE status = 'BORROWED'`) trên `loan_records` + Tính `overdue_days` động theo ngày lịch Việt Nam (`Asia/Ho_Chi_Minh`) (Đề xuất)**
   - *Ưu điểm:* Chống race condition triệt để ngay ở tầng SQLite khi 2 giáo viên bấm mượn cùng lúc; không cần bảng danh mục học sinh riêng; không cần cron job quét ban đêm để đổi trạng thái `OVERDUE`; tránh lệch 1 ngày do múi giờ UTC so với giờ Việt Nam.
   - *Nhược điểm:* Phụ thuộc vào quy tắc chuẩn hóa chuỗi (nếu giáo viên cố tình viết tắt tên học sinh hoặc đổi cách viết tên lớp hoàn toàn khác như `3A1` vs `3A 1` thì vẫn coi là khác — cần quy tắc chuẩn hóa rõ ràng và hỗ trợ gợi ý định dạng trên UI).
2. **Tạo bảng `student_records` riêng (tự upsert khi mượn) + Dùng Cron Job định kỳ chuyển trạng thái sang `OVERDUE`**
   - *Ưu điểm:* Tách biệt thực thể học bạ.
   - *Nhược điểm:* Nếu máy chủ tắt qua đêm hoặc cron lỗi, Dashboard sẽ hiển thị sai danh sách đỏ; thêm độ phức tạp cho MVP.
3. **Chỉ kiểm tra trùng bằng câu lệnh `SELECT` trong code + Lưu `due_date` dạng timestamp UTC**
   - *Ưu điểm:* Viết nhanh.
   - *Nhược điểm:* Có lỗ hổng race condition khi 2 yêu cầu gửi đồng thời; dễ tính sai ngày quá hạn quanh thời điểm 00:00–07:00 sáng tại Việt Nam.

## Decision

Chọn **Phương án 1: Chuẩn hóa khóa định danh `record_identity_key` + Partial Unique Index (`WHERE status = 'BORROWED'`) trên `loan_records` + Tính `overdue_days` động theo ngày lịch Việt Nam (`Asia/Ho_Chi_Minh`)** theo phê duyệt của chủ dự án ngày `2026-11-24`, chống mượn trùng tuyệt đối ở tầng DB và không phụ thuộc cron job nền.

## Consequences

_(Cập nhật chính thức khi Decision được chọn; dự kiến theo Phương án 1 nếu được duyệt)_:
- `loan_records` lưu cả 3 trường gốc đã làm sạch (`class_name`, `student_name`, `school_year`) và cột `record_identity_key` (chuẩn hóa NFC, trim, gộp khoảng trắng, lowercase `vi-VN`, chuẩn hóa dấu `-` ở niên khóa).
- Bắt buộc có Partial Unique Index `idx_loan_active_identity ON loan_records(record_identity_key) WHERE status = 'BORROWED'`. Khi vi phạm ràng buộc unique, API trả về HTTP `409 Conflict` kèm tên giáo viên đang giữ học bạ.
- `loan_records` lưu snapshot thông tin giáo viên (`teacher_name_snapshot`, `teacher_phone_snapshot`, `teacher_unit_snapshot`) lúc tạo phiếu.
- `due_date` lưu dạng ngày lịch `YYYY-MM-DD`; quá hạn được xác định động khi `status = 'BORROWED'` và `todayVN > due_date`.
