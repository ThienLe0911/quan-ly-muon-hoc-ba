# ADR 005: Mở rộng định danh phiếu mượn hỗ trợ 2 loại (Cả lớp / Riêng lẻ) và chặn mượn trùng chéo 2 chiều

- Status: Accepted <!-- chủ dự án duyệt trong chat ngày 2026-11-26 -->
- Date: 2026-11-26
- Người đề xuất: PM (Antigravity)
- Bổ sung / mở rộng: [ADR 003](003-dinh-danh-hoc-ba-va-quy-tac-qua-han.md)

## Context

Sau khi vận hành thực tế trên Vercel + Turso, chủ dự án yêu cầu bổ sung **2 loại mượn học bạ**:
1. **Mượn toàn bộ học bạ của 1 lớp (`WHOLE_CLASS`)** — nhập `Lớp + Niên khóa + Số lượng học bạ (tùy chọn 1..200)`, không cần nhập tên học sinh.
2. **Mượn riêng lẻ theo học sinh (`INDIVIDUAL`)** — nhập `Lớp + Tên học sinh + Niên khóa` như hiện tại.

Yêu cầu nghiệp vụ kèm theo:
- **Chặn trùng chéo 2 chiều** theo `(Lớp, Niên khóa)`: đang có phiếu mượn cả lớp thì chặn mọi phiếu mượn lẻ của lớp đó; ngược lại đang có `>= 1` phiếu mượn lẻ chưa trả thì chặn phiếu mượn cả lớp.
- **An toàn dữ liệu trên Turso Cloud đang chạy live:** Cột `student_name` trong migration `0000_initial.sql` đang có ràng buộc `TEXT NOT NULL`. SQLite/libSQL không hỗ trợ `ALTER TABLE ... DROP NOT NULL`, nên cần giải pháp migration an toàn, không phải rebuild bảng `loan_records` gây rủi ro mất dữ liệu hoặc lỗi khóa ngoại trên Turso.

## Options

1. **Thêm 3 cột mới qua `ALTER TABLE` (`loan_type`, `class_year_key`, `quantity`) + giữ `student_name NOT NULL` (lưu `"Toàn bộ lớp"` cho `WHOLE_CLASS`) + Index `(class_year_key, status)` + kiểm tra chéo trong `withWriteTransaction` *(Đề xuất)***
   - *Ưu điểm:*
     - Migration `0002_loan_type_and_whole_class.sql` chỉ dùng `ALTER TABLE ADD COLUMN` + `CREATE INDEX` và backfill `class_year_key` cho phiếu cũ — **an toàn tuyệt đối, zero rebuild bảng** trên Turso đang chạy thật.
     - Giữ nguyên Partial Unique Index `idx_loan_active_identity`:
       - `INDIVIDUAL`: `record_identity_key = "${normClass}|${normStudent}|${normSchoolYear}"` (100% tương thích ngược dữ liệu cũ).
       - `WHOLE_CLASS`: `record_identity_key = "class:${normClass}|${normSchoolYear}"` (không bao giờ đụng khóa học sinh lẻ).
     - Index `idx_loan_class_year_status ON loan_records(class_year_key, status)` giúp truy vấn kiểm tra chéo 2 chiều đạt `O(log N)` ngay trong cùng `withWriteTransaction` (chống race condition khi 1 request mượn cả lớp và 1 request mượn lẻ gửi đồng thời).
     - `POST /api/loans` mặc định `loanType = 'INDIVIDUAL'` nếu client không truyền → **tương thích ngược 100%** với mọi test và client cũ.
   - *Nhược điểm:*
     - Cột `student_name` lưu chuỗi hiển thị `"Toàn bộ lớp"` thay vì `NULL` cho phiếu `WHOLE_CLASS` (phân biệt chính thức bằng cột `loan_type`, không dựa vào nội dung `student_name`).

2. **Rebuild toàn bộ bảng `loan_records` để đổi `student_name` thành `NULLABLE`**
   - *Ưu điểm:* `student_name` có thể lưu `NULL` cho phiếu `WHOLE_CLASS`.
   - *Nhược điểm:* Trên SQLite/Turso, rebuild bảng (`CREATE TABLE loan_records_new` → `INSERT SELECT` → `DROP TABLE` → `RENAME`) rủi ro cao với khóa ngoại, dễ lỗi khi có traffic thật hoặc khi migration chạy qua HTTP trên Turso, và phức tạp hóa mọi UI/search đang kỳ vọng `student_name: string`.

3. **Tách bảng riêng `class_loan_records` cho phiếu mượn cả lớp**
   - *Ưu điểm:* Tách biệt schema 2 loại phiếu.
   - *Nhược điểm:* Phải nhân đôi hoặc `UNION ALL` toàn bộ truy vấn Dashboard, Danh sách đỏ, Danh sách theo thời gian, Phân trang, Trả/Hủy phiếu và Audit Log — tăng mạnh độ phức tạp mà không cần thiết vì 2 loại mượn dùng chung 100% vòng đời (`BORROWED`/`RETURNED`/`CANCELLED`, hạn trả, mức độ lố hạn).

## Decision

Chọn **Phương án 1: Thêm 3 cột mới qua `ALTER TABLE` (`loan_type`, `class_year_key`, `quantity`) + giữ `student_name NOT NULL` (lưu `"Toàn bộ lớp"` cho `WHOLE_CLASS`) + Index `idx_loan_class_year_status` + kiểm tra chéo 2 chiều nguyên tử trong `withWriteTransaction`** theo phê duyệt của chủ dự án ngày `2026-11-26`. Giải pháp đảm bảo zero rebuild bảng trên Turso Cloud đang vận hành và tương thích ngược 100% với dữ liệu hiện có.

## Consequences

Các thay đổi được triển khai đồng bộ:
- Tạo migration `0002_loan_type_and_whole_class.sql` (kèm đăng ký vào `src/db/migrations/registry.ts` và backfill `class_year_key` cho các phiếu cũ).
- Cập nhật `docs/architecture/architecture.md` (thêm 3 cột `loan_type`, `class_year_key`, `quantity` và index `idx_loan_class_year_status` cho `loan_records`, cập nhật mô tả `POST /api/loans` & `GET /api/loans?loanType=...`), đồng bộ thuật ngữ `"Giáo vụ"` tại `docs/vision/vision.md`, `docs/product/product.md`, `docs/architecture/architecture.md`, `README.md`, `.env.example`.
- Cập nhật `src/lib/domain/record-identity.ts`, `src/lib/domain/search.ts`, `src/lib/api/validators.ts`, `src/app/api/loans/route.ts`, `src/app/api/loans/[id]/return/route.ts`, `src/app/api/loans/[id]/cancel/route.ts`, `BorrowForm.tsx`, `TeacherLoansList.tsx`, `LoansTable.tsx`, `RedListPanel.tsx`, `ReturnCancelModals.tsx` và các nhãn `"Văn thư"` → `"Giáo vụ"`.
- Bổ sung bộ kiểm thử đầy đủ cho `WHOLE_CLASS`, chặn trùng chéo 2 chiều (cả tuần tự lẫn đồng thời `Promise.all`) và migration `0002` + backfill.
