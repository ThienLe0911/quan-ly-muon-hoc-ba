> Status: Validated (2026-11-26)

# Spec: Quản lý Mượn – Trả Học Bạ Trường Tiểu Học

- **Mã feature:** `quan-ly-muon-tra-hoc-ba`
- **Tài liệu liên quan:**
  - [`docs/vision/vision.md`](../../vision/vision.md)
  - [`docs/product/product.md`](../../product/product.md)
  - [`docs/architecture/architecture.md`](../../architecture/architecture.md)
  - ADR `Accepted`: [`002`](../../architecture/decisions/002-co-che-xac-thuc-va-phan-quyen.md), [`003`](../../architecture/decisions/003-dinh-danh-hoc-ba-va-quy-tac-qua-han.md), [`004`](../../architecture/decisions/004-trien-khai-vercel-va-co-so-du-lieu-turso.md), [`005`](../../architecture/decisions/005-bo-sung-loai-muon-ca-lop-va-chan-trung-cheo.md)

---

## 1. Goal

Xây dựng ứng dụng web nội bộ đơn giản, rõ ràng bằng tiếng Việt để quản lý quy trình **mượn và trả học bạ** tại văn phòng Trường Tiểu học, với 2 vai trò **Admin (Giáo vụ)** và **Giáo viên**:
- Giáo viên tự tạo phiếu mượn học bạ theo **2 loại mượn**:
  1. **Mượn toàn bộ của 1 lớp (`WHOLE_CLASS`):** định danh bằng **Lớp + Niên khóa** (kèm **Số lượng học bạ** tùy chọn để Giáo vụ đối chiếu khi nhận lại).
  2. **Mượn riêng lẻ học sinh (`INDIVIDUAL`):** định danh bằng **Lớp + Tên học sinh + Niên khóa**.
- Hệ thống tự lưu thông tin giáo viên, ngày mượn, hạn trả và **chặn mượn trùng chéo 2 chiều** (cả lớp ↔ học sinh lẻ cùng Lớp + Niên khóa) khi học bạ chưa được trả.
- Chỉ Admin (Giáo vụ) được xác nhận đã trả học bạ khi thu hồi sổ giấy (trả trọn bộ 1 lần).
- Dashboard Admin làm nổi bật ngay **Danh sách đỏ** gồm các học bạ lố hạn trả (`>= 1` ngày), đồng thời cho phép Admin theo dõi đầy đủ:
  1. **Danh sách mượn** (tất cả / theo trạng thái / theo loại mượn),
  2. **Danh sách theo thời gian mượn**,
  3. **Danh sách theo độ lố hạn cần lưu ý**.

---

## 2. Business Context

- Tại Trường Tiểu học, học bạ gốc của học sinh được lưu trữ tập trung tại phòng Giáo vụ. Giáo viên chủ nhiệm hoặc giáo viên phụ trách hồ sơ thường xuyên cần mượn **toàn bộ học bạ của cả một lớp** (để ghi nhận xét cuối kỳ/cuối năm, kiểm tra hồ sơ lớp) hoặc mượn **riêng lẻ từng cuốn học bạ** của một học sinh (để làm thủ tục chuyển trường, đối chiếu thông tin).
- Nếu không quản lý chặt chẽ, Giáo vụ khó biết ai đang giữ cả chồng học bạ của lớp nào hoặc cuốn lẻ của em nào, và đặc biệt dễ bỏ sót những phiếu mượn quá hạn nhiều ngày.
- Hệ thống thay thế sổ ghi tay bằng công cụ số hóa gọn nhẹ, sử dụng được cả trên máy tính văn phòng lẫn trình duyệt điện thoại của giáo viên.

---

## 3. User Stories

### Nhóm Tài khoản & Xác thực
- **US-01:** Là **Admin (Giáo vụ)**, tôi muốn tạo, cập nhật, khóa/mở khóa và đặt lại mật khẩu cho tài khoản giáo viên (kèm họ tên, SĐT, lớp/tổ chuyên môn) để kiểm soát đúng người được phép mượn học bạ.
- **US-02:** Là **Giáo viên / Admin (Giáo vụ)**, tôi muốn đăng nhập bằng tên đăng nhập và mật khẩu, cũng như tự đổi mật khẩu của mình để bảo mật tài khoản.

### Nhóm Giáo viên mượn & theo dõi học bạ
- **US-03:** Là **Giáo viên**, tôi muốn chọn nhanh **loại mượn** (*Mượn toàn bộ 1 lớp* hoặc *Mượn riêng lẻ theo học sinh*), nhập thông tin tương ứng (`Lớp`, `Niên khóa`, `Tên học sinh` nếu mượn lẻ hoặc `Số lượng học bạ` tùy chọn nếu mượn cả lớp), chọn `Hạn trả` (đã điền sẵn mặc định) và ghi chú lý do mượn.
- **US-04:** Là **Giáo viên**, tôi muốn được hệ thống cảnh báo ngay nếu học bạ (hoặc toàn bộ lớp đó, hoặc đã có học sinh trong lớp đó đang bị mượn lẻ) hiện đang có người giữ chưa trả, để tránh mượn trùng hoặc thiếu sổ.
- **US-05:** Là **Giáo viên**, tôi muốn xem danh sách các phiếu mình đang mượn (phân biệt rõ phiếu **Cả lớp** và phiếu **Riêng lẻ**, thấy rõ phiếu nào sắp đến hạn hoặc đã lố hạn) và lịch sử các phiếu đã trả.

### Nhóm Admin (Giáo vụ) theo dõi Dashboard, Danh sách đỏ & Xác nhận trả
- **US-06:** Là **Admin (Giáo vụ)**, ngay khi mở Dashboard, tôi muốn nhìn thấy **Danh sách đỏ** chứa tất cả các phiếu đã lố hạn trả (`>= 1` ngày) cùng loại mượn, tên giáo viên, SĐT và số ngày trễ để gọi nhắc thu hồi ngay.
- **US-07:** Là **Admin (Giáo vụ)**, tôi muốn xem và tìm kiếm **Danh sách mượn** theo tên học sinh, lớp, niên khóa, giáo viên mượn, loại mượn (Cả lớp / Riêng lẻ) hoặc trạng thái (Đang mượn / Đã trả / Đã hủy).
- **US-08:** Là **Admin (Giáo vụ)**, tôi muốn xem **Danh sách theo thời gian mượn** (lọc theo khoảng ngày mượn, sắp xếp mới nhất hoặc cũ nhất) để kiểm soát lượng hồ sơ xuất kho theo ngày/tuần.
- **US-09:** Là **Admin (Giáo vụ)**, tôi muốn xem **Danh sách theo độ lố hạn cần lưu ý** được phân mức rõ ràng (Nghiêm trọng / Vừa / Nhẹ và nhóm Sắp đến hạn) và sắp xếp từ mức lố hạn cao nhất xuống thấp nhất để ưu tiên xử lý.
- **US-10:** Là **Admin (Giáo vụ)**, khi giáo viên mang sổ giấy trả lại phòng Giáo vụ (trả trọn bộ cả lớp hoặc cuốn lẻ), tôi muốn bấm **Xác nhận đã trả** (và ghi chú tình trạng sổ nếu cần) để đóng phiếu mượn.
- **US-11:** Là **Admin (Giáo vụ)**, tôi muốn cấu hình số ngày mượn mặc định của trường (vd: 7 ngày) và số ngày mượn tối đa cho phép.
- **US-12:** Là **Admin (Giáo vụ)**, tôi muốn hủy phiếu mượn nhập nhầm (bắt buộc nhập lý do) và xem nhật ký thao tác để đối chiếu khi có sai sót.

---

## 4. Functional Requirements

### FR-01: Đăng nhập, đăng xuất & đổi mật khẩu
- Đăng nhập bằng `username` (không phân biệt hoa/thường) và `password`.
- Tài khoản bị khóa (`is_active = 0`) không thể đăng nhập; nếu đang đăng nhập mà bị khóa thì phiên lập tức hết hiệu lực. Thông báo hướng dẫn liên hệ **Giáo vụ**.
- Hỗ trợ đăng xuất và đổi mật khẩu cá nhân (nhập mật khẩu hiện tại + mật khẩu mới). Nếu `must_change_password = 1`, giao diện nhắc và điều hướng đổi mật khẩu trước khi thao tác tiếp.

### FR-02: Quản lý tài khoản Giáo viên (chỉ Admin / Giáo vụ)
- Admin xem danh sách tài khoản, lọc theo trạng thái hoạt động/đã khóa, tìm theo họ tên/tên đăng nhập/SĐT/lớp-tổ.
- Admin tạo tài khoản mới: `username` (duy nhất), `full_name` (bắt buộc), `role` (`TEACHER` mặc định hoặc `ADMIN` — hiển thị nhãn **Admin (Giáo vụ)**), `phone`, `unit` (Lớp/Tổ chuyên môn), `password` tạm (bắt buộc đổi khi đăng nhập nếu bật tùy chọn).
- Admin chỉnh sửa `full_name`, `phone`, `unit`, trạng thái `is_active` và thực hiện **Đặt lại mật khẩu** cho giáo viên (hệ thống hủy các phiên đang đăng nhập của tài khoản đó).
- Không cho phép Admin tự khóa chính tài khoản mình đang đăng nhập hoặc hạ/khóa tài khoản Admin hoạt động duy nhất cuối cùng.

### FR-03: Cấu hình hạn mượn mặc định (chỉ Admin / Giáo vụ)
- Admin xem và chỉnh sửa:
  - `default_loan_days`: số ngày mượn mặc định tính từ ngày mượn (mặc định khởi tạo: `7`, khoảng hợp lệ `1..90`).
  - `max_loan_days`: số ngày tối đa giáo viên được chọn làm hạn trả (mặc định khởi tạo: `30`, phải `>= default_loan_days`).

### FR-04: Tạo phiếu mượn học bạ (hỗ trợ 2 loại mượn)
- Người dùng chọn loại mượn `loan_type`:
  - **`WHOLE_CLASS` (Mượn toàn bộ của 1 lớp):**
    - `class_name` (Lớp, bắt buộc, 1–30 ký tự, vd: `3A`, `5/2`)
    - `school_year` (Niên khóa, bắt buộc đúng định dạng chuẩn `YYYY-YYYY`, vd: `2025-2026` hoặc `2021-2026`)
    - `quantity` (Số lượng học bạ, **tùy chọn**, nếu nhập phải là số nguyên từ `1` đến `200`, giúp Giáo vụ đối chiếu khi nhận lại sổ)
    - Ẩn ô `Tên học sinh` trên form; hệ thống tự lưu giá trị hiển thị `student_name = "Toàn bộ lớp"`.
  - **`INDIVIDUAL` (Mượn riêng lẻ học sinh — mặc định khi không truyền `loan_type` để tương thích ngược API):**
    - `class_name` (Lớp, bắt buộc, 1–30 ký tự)
    - `student_name` (Tên học sinh, bắt buộc, 2–100 ký tự)
    - `school_year` (Niên khóa, bắt buộc đúng định dạng `YYYY-YYYY`, tự chuẩn hóa dấu gạch nối dài `–`/`—` và khoảng trắng quanh `-`, ràng buộc `năm_sau > năm_trước` và `1 <= năm_sau - năm_trước <= 10`)
    - `quantity` không áp dụng (`null`).
- Các trường chung cho cả 2 loại mượn:
  - `due_date` (Hạn ngày trả `YYYY-MM-DD`, tự động điền sẵn = `ngày mượn VN + default_loan_days`; không được trước ngày mượn và không vượt quá `ngày mượn VN + max_loan_days`)
  - `borrow_note` (Ghi chú/Lý do mượn, tùy chọn, tối đa 300 ký tự)
- **Không cho phép mượn hộ:** Chỉ tài khoản có vai trò `TEACHER` được tạo phiếu mượn cho chính mình; không cho phép Admin hay bất kỳ ai tạo phiếu mượn hộ giáo viên khác. `teacher_id` luôn lấy từ phiên đăng nhập phía server; bỏ qua mọi trường `teacher_id` gửi từ client.
- Hệ thống tự động lưu:
  - `teacher_id` + snapshot thông tin giáo viên (`teacher_name_snapshot`, `teacher_phone_snapshot`, `teacher_unit_snapshot`),
  - `loan_type`, `quantity`, `class_year_key`, `record_identity_key`,
  - `borrowed_at` = thời điểm tạo phiếu trên server,
  - `status` = `BORROWED`.

### FR-05: Chống mượn trùng học bạ & chặn trùng chéo 2 chiều
- Hệ thống chuẩn hóa `(class_name, school_year)` thành `class_year_key = ${normClass}|${normSchoolYear}` và tạo khóa định danh duy nhất `record_identity_key`:
  - Với `INDIVIDUAL`: `${normClass}|${normStudent}|${normSchoolYear}`
  - Với `WHOLE_CLASS`: `class:${normClass}|${normSchoolYear}`
- Quy tắc chặn trùng (thực thi nguyên tử bên trong write transaction kết hợp Partial Unique Index `idx_loan_active_identity`):
  1. **Trùng cùng loại:**
     - Học sinh lẻ trùng học sinh lẻ (cùng `record_identity_key`, `status = 'BORROWED'`) → `409 Conflict` (`DUPLICATE_ACTIVE_LOAN`).
     - Cả lớp trùng cả lớp (cùng `record_identity_key`, `status = 'BORROWED'`) → `409 Conflict` (`DUPLICATE_ACTIVE_LOAN`).
  2. **Chặn chéo 2 chiều (cùng `class_year_key`, `status = 'BORROWED'`):**
     - **Đang mượn cả lớp → chặn mượn lẻ:** Nếu đã có phiếu `WHOLE_CLASS` đang `BORROWED` của lớp + niên khóa đó, mọi yêu cầu mượn `INDIVIDUAL` của bất kỳ học sinh nào thuộc lớp + niên khóa đó đều bị chặn `409 Conflict` (`DUPLICATE_ACTIVE_LOAN`), thông báo rõ toàn bộ học bạ lớp đang được giáo viên nào mượn, ngày mượn và hạn trả (`DD/MM/YYYY`).
     - **Đang có học sinh mượn lẻ → chặn mượn cả lớp:** Nếu đã có `>= 1` phiếu `INDIVIDUAL` đang `BORROWED` thuộc lớp + niên khóa đó, mọi yêu cầu mượn `WHOLE_CLASS` của lớp + niên khóa đó đều bị chặn `409 Conflict` (`DUPLICATE_ACTIVE_LOAN`), thông báo rõ lớp đang có `N` học bạ mượn lẻ chưa trả (nêu tên học sinh và giáo viên đang giữ ở phiếu đầu tiên).
- Bảo đảm cô lập dữ liệu: payload chi tiết `error.details.existingLoan` chỉ trả các trường tối thiểu `{ teacherNameSnapshot, borrowedAt, dueDate }` (không lộ SĐT hoặc ghi chú mượn của giáo viên khác).
- Khi toàn bộ phiếu xung đột đã chuyển sang `RETURNED` hoặc `CANCELLED`, hệ thống cho phép mượn lại bình thường (cả lớp hoặc riêng lẻ).

### FR-06: Theo dõi phiếu mượn phía Giáo viên
- Giáo viên xem được 2 tab (phân trang phía server, mặc định 20 bản ghi/trang):
  - **Đang mượn (`status=BORROWED`):** đánh dấu cảnh báo màu đỏ nếu đang lố hạn, màu vàng nếu sắp đến hạn/đến hạn hôm nay.
  - **Lịch sử đã trả / đã hủy (`status=HISTORY`).**
- Hiển thị badge phân biệt rõ phiếu **`Cả lớp`** (kèm số lượng quyển nếu có, vd: `35 quyển`) và phiếu **`Riêng lẻ`** (kèm tên học sinh).
- Cho phép tìm kiếm nhanh có dấu/không dấu theo tên học sinh, lớp, niên khóa.

### FR-07: Dashboard Admin (Giáo vụ) & Danh sách đỏ quá hạn
- Trang chủ Admin hiển thị tiêu đề **Bảng điều khiển Giáo vụ (Admin)** cùng 4 thẻ thống kê KPI:
  1. **Đang mượn (Tổng)** (`status = 'BORROWED'`)
  2. **Danh sách đỏ — Quá hạn trả** (`status = 'BORROWED'` và `overdue_days >= 1`)
  3. **Sắp đến hạn / Đến hạn hôm nay** (`-2 <= overdue_days <= 0`)
  4. **Đã trả trong tháng / tuần**
- Khu vực **Danh sách đỏ (Cần thu hồi ngay)** liệt kê toàn bộ phiếu có `overdue_days >= 1` (cả phiếu **Cả lớp** và **Riêng lẻ**), mặc định sắp xếp giảm dần theo `overdue_days`, hiển thị rõ:
  - Loại mượn + Học bạ (`Cả lớp` – `Lớp` – `Niên khóa` – `Số lượng quyển` nếu có; hoặc `Riêng lẻ` – `Lớp` – `Tên học sinh` – `Niên khóa`)
  - Giáo viên mượn (`Họ tên` – `Lớp/Tổ` – `SĐT`)
  - `Ngày mượn`, `Hạn trả`, badge **`Quá hạn X ngày`** + mức cảnh báo
  - Nút hành động nhanh **Xác nhận đã trả**.

### FR-08: Danh sách mượn đầy đủ (Admin / Giáo vụ)
- Bảng tổng hợp tất cả phiếu mượn hỗ trợ:
  - Tìm kiếm tự do có dấu/không dấu theo: tên học sinh, lớp, niên khóa, họ tên giáo viên.
  - Lọc theo trạng thái: Tất cả / Đang mượn / Đang quá hạn / Đã trả / Đã hủy.
  - Lọc theo **loại mượn (`loanType`)**: Tất cả / Mượn cả lớp (`WHOLE_CLASS`) / Mượn riêng lẻ (`INDIVIDUAL`).
  - Lọc theo giáo viên, lớp hoặc niên khóa.
  - Phân trang phía server (mặc định 20 dòng/trang) và hiển thị chi tiết phiếu (loại mượn, số lượng quyển nếu có, người mượn, ngày mượn, hạn trả, người xác nhận trả, ngày trả, ghi chú).

### FR-09: Danh sách theo thời gian mượn (Admin / Giáo vụ)
- Chế độ xem chuyên biệt theo dòng thời gian mượn (`borrowed_at`):
  - Bộ lọc nhanh khoảng thời gian: Hôm nay / 7 ngày qua / 30 ngày qua / Tháng này / Tùy chọn `Từ ngày` – `Đến ngày`.
  - Chọn chiều sắp xếp: Mới mượn gần nhất (`borrowed_at DESC`) hoặc Mượn lâu nhất trước (`borrowed_at ASC`).
  - Hiển thị rõ mốc ngày – giờ mượn theo giờ Việt Nam (`DD/MM/YYYY HH:mm`), loại mượn và trạng thái trả hiện tại của từng phiếu.

### FR-10: Danh sách theo độ lố hạn cần lưu ý (Admin / Giáo vụ)
- Chế độ xem phân tầng ưu tiên các phiếu đang mượn theo mức độ cấp bách (tính theo ngày lịch Việt Nam):
  - **Mức 1 — Quá hạn nghiêm trọng (`overdue_days >= 8` ngày):** Màu đỏ đậm
  - **Mức 2 — Quá hạn vừa (`4 <= overdue_days <= 7` ngày):** Màu đỏ
  - **Mức 3 — Quá hạn nhẹ (`1 <= overdue_days <= 3` ngày):** Màu cam đỏ
  - *(Tùy chọn lọc kèm)* **Nhóm lưu ý sắp hạn (`-2 <= overdue_days <= 0` ngày):** Đến hạn hôm nay hoặc còn 1–2 ngày tới hạn (màu vàng hổ phách) để Giáo vụ nhắc sớm.
- Cho phép lọc từng nhóm mức độ, sắp xếp mặc định theo `overdue_days DESC`, sau đó đến `borrowed_at ASC`, kèm số lượng thống kê từng nhóm và thông tin liên hệ giáo viên.

### FR-11: Xác nhận trả học bạ (chỉ Admin / Giáo vụ)
- Chỉ Admin (Giáo vụ) có quyền thực hiện thao tác trên phiếu có `status = 'BORROWED'`.
- Với phiếu `WHOLE_CLASS`, thực hiện **trả trọn bộ cả lớp trong 1 lần xác nhận** (hộp thoại hiển thị rõ tên lớp và số lượng học bạ đã ghi khi mượn nếu có để Giáo vụ đối chiếu).
- Admin có thể nhập `return_note` (tùy chọn, vd: "Đã nhận đủ 35 quyển, nguyên vẹn").
- Khi xác nhận: chuyển `status = 'RETURNED'`, lưu `returned_at`, `returned_by_admin_id`, `return_note`, và ghi `audit_logs`.
- Không cho phép xác nhận trả lại một phiếu đã `RETURNED` hoặc `CANCELLED` (trả về lỗi `409 Conflict`).

### FR-12: Hủy phiếu nhập nhầm & Nhật ký kiểm toán (chỉ Admin / Giáo vụ)
- Chỉ Admin (Giáo vụ) được hủy phiếu đang ở trạng thái `BORROWED` khi phát hiện tạo nhầm thông tin (`status` → `CANCELLED`), bắt buộc nhập `cancel_reason` (tối thiểu 3 ký tự). Không xóa vật lý bản ghi khỏi cơ sở dữ liệu.
- Admin xem được trang **Nhật ký thao tác** (`audit_logs`) hiển thị thời gian, người thực hiện, hành động, đối tượng và chi tiết thay đổi (bao gồm `loanType` và `quantity` trong metadata của `LOAN_CREATED` / `LOAN_RETURNED` / `LOAN_CANCELLED`).

---

## 5. Business Rules

- **BR-01 (Định danh theo loại mượn):**
  - Mọi phiếu mượn bắt buộc có `loan_type` (`INDIVIDUAL` hoặc `WHOLE_CLASS`), `Lớp` và `Niên khóa` (bắt buộc định dạng `YYYY-YYYY`, `năm_sau > năm_trước`, chênh lệch `1..10` năm).
  - Nếu `loan_type = 'INDIVIDUAL'`: bắt buộc có `Tên học sinh` (`2..100` ký tự), `quantity = null`.
  - Nếu `loan_type = 'WHOLE_CLASS'`: không yêu cầu nhập tên học sinh (lưu nhãn hiển thị `"Toàn bộ lớp"`), `quantity` tùy chọn (nếu nhập phải là số nguyên `1..200`).
- **BR-02 (Chống mượn trùng & chặn trùng chéo 2 chiều):**
  - Chuẩn hóa chuỗi (`NFC`, trim, gộp khoảng trắng, lowercase `vi-VN`, chuẩn hóa dấu `-` ở niên khóa) tạo `class_year_key` (`${normClass}|${normSchoolYear}`) và `record_identity_key` (`${normClass}|${normStudent}|${normSchoolYear}` cho `INDIVIDUAL`; `class:${normClass}|${normSchoolYear}` cho `WHOLE_CLASS`).
  - Hệ thống cưỡng chế ở tầng DB bằng Partial Unique Index `idx_loan_active_identity` (`WHERE status = 'BORROWED'`) và kiểm tra chéo nguyên tử theo `class_year_key` trong cùng write transaction:
    - Đang có phiếu `WHOLE_CLASS` (`BORROWED`) của `(Lớp, Niên khóa)` → chặn mọi phiếu `WHOLE_CLASS` và `INDIVIDUAL` cùng `(Lớp, Niên khóa)`.
    - Đang có bất kỳ phiếu `INDIVIDUAL` (`BORROWED`) của `(Lớp, Niên khóa)` → chặn mọi phiếu `WHOLE_CLASS` cùng `(Lớp, Niên khóa)`.
- **BR-03 (Bất biến lịch sử người mượn):** Thông tin giáo viên (`Họ tên`, `SĐT`, `Lớp/Tổ chuyên môn`) phải được chụp (snapshot) vào phiếu mượn tại thời điểm tạo để không bị sai lệch lịch sử nếu tài khoản giáo viên được cập nhật về sau.
- **BR-04 (Quy tắc ngày mượn & hạn trả):**
  - Ngày mượn `borrowed_at` do hệ thống tự ghi theo đồng hồ server, không cho phép người dùng tự sửa lùi/tới ngày mượn.
  - Hạn trả `due_date` mặc định = `ngày mượn (giờ VN) + default_loan_days`. Nếu người mượn tự chọn ngày khác, phải thỏa `ngày mượn (giờ VN) <= due_date <= ngày mượn (giờ VN) + max_loan_days`.
- **BR-05 (Quy tắc tính quá hạn & Danh sách đỏ):**
  - Múi giờ chuẩn là `Asia/Ho_Chi_Minh`.
  - Phiếu được tính là **lố hạn / quá hạn** khi `status = 'BORROWED'` và `todayVN > due_date` (tức `overdue_days >= 1`).
  - Mọi phiếu thỏa điều kiện trên (cả `WHOLE_CLASS` và `INDIVIDUAL`) tự động xuất hiện trong **Danh sách đỏ** trên Dashboard Admin mà không phụ thuộc job chạy ngầm.
- **BR-06 (Phân mức độ lố hạn cần lưu ý):**
  - `overdue_days >= 8`: Quá hạn nghiêm trọng (`CRITICAL`).
  - `4 <= overdue_days <= 7`: Quá hạn vừa (`MODERATE`).
  - `1 <= overdue_days <= 3`: Quá hạn nhẹ (`MILD`).
  - `overdue_days == 0`: Đến hạn hôm nay (`DUE_TODAY`).
  - `-2 <= overdue_days <= -1`: Sắp đến hạn (`DUE_SOON`).
  - `overdue_days <= -3`: Trong hạn (`ON_TIME`).
- **BR-07 (Thẩm quyền xác nhận trả):** Chỉ `ADMIN` (Giáo vụ) được xác nhận trả học bạ (`BORROWED` → `RETURNED`). Giáo viên tuyệt đối không thể tự đánh dấu đã trả. Phiếu `WHOLE_CLASS` được xác nhận trả trọn bộ 1 lần.
- **BR-08 (Không xóa cứng dữ liệu nghiệp vụ):** Phiếu mượn không bị `DELETE` khỏi DB; trường hợp nhập sai chỉ chuyển trạng thái sang `CANCELLED` kèm lý do và người thực hiện.
- **BR-09 (Tài khoản giáo viên bị khóa):** Khi Admin khóa tài khoản giáo viên (`is_active = 0`), giáo viên đó không đăng nhập hoặc tạo phiếu mới được, nhưng các phiếu `BORROWED` trước đó vẫn tiếp tục hiển thị bình thường (và vào Danh sách đỏ nếu quá hạn) để Giáo vụ thu hồi.
- **BR-10 (Bảo vệ quyền Admin cuối cùng):** Không cho phép khóa hoặc hạ quyền tài khoản `ADMIN` hoạt động duy nhất còn lại trong hệ thống.
- **BR-11 (Không cho phép mượn hộ):** Chỉ vai trò `TEACHER` được phép gọi chức năng mượn học bạ (`POST /api/loans`) và phiếu mượn luôn gắn trực tiếp với tài khoản giáo viên đang đăng nhập; `ADMIN` không được tạo phiếu mượn hộ giáo viên khác (`403 Forbidden`).

---

## 6. Permissions

| Chức năng / Tài nguyên | Chưa đăng nhập | Giáo viên (`TEACHER`) | Admin — Giáo vụ (`ADMIN`) |
| --- | --- | --- | --- |
| Đăng nhập (`/login`, `POST /api/auth/login`) | Cho phép | Cho phép | Cho phép |
| Đăng xuất (`POST /api/auth/logout`) | Cho phép (idempotent 200, xóa cookie) | Cho phép | Cho phép |
| Đổi mật khẩu của bản thân (`POST /api/auth/change-password`) | Từ chối (401) | Cho phép | Cho phép |
| Tạo phiếu mượn học bạ (`POST /api/loans` — cả lớp hoặc riêng lẻ) | Từ chối (401) | Cho phép (chỉ cho bản thân) | Từ chối (403) — không mượn hộ |
| Xem danh sách & lịch sử mượn **của bản thân** | Từ chối (401) | Cho phép | — (Admin xem toàn trường qua Dashboard/Danh sách mượn) |
| Xem Dashboard Giáo vụ, Danh sách đỏ, Danh sách toàn trường | Từ chối (401) | Từ chối (403) | Cho phép |
| Xem Danh sách theo thời gian mượn & Độ lố hạn | Từ chối (401) | Từ chối (403) | Cho phép |
| Xác nhận đã trả học bạ (`POST /api/loans/[id]/return`) | Từ chối (401) | Từ chối (403) | Cho phép |
| Hủy phiếu nhập nhầm (`POST /api/loans/[id]/cancel`) | Từ chối (401) | Từ chối (403) | Cho phép |
| Quản lý tài khoản giáo viên (`/api/users*`) | Từ chối (401) | Từ chối (403) | Cho phép |
| Cấu hình hạn mượn mặc định/tối đa (`PATCH /api/settings`) | Từ chối (401) | Từ chối (403) | Cho phép |
| Xem nhật ký thao tác (`GET /api/audit-logs`) | Từ chối (401) | Từ chối (403) | Cho phép |

---

## 7. Integrations

- **Trong phạm vi MVP:** Không tích hợp dịch vụ bên thứ ba (SMS, Zalo OA, Email SMTP, Google OAuth); triển khai trên Vercel + cơ sở dữ liệu Turso Cloud (ADR-004).
- **Khả năng mở rộng về sau:** Kiến trúc tách domain service và ghi sẵn `audit_logs` cho phép gắn thêm module thông báo (Zalo/Email) hoặc xuất báo cáo Excel ở các phiên bản sau.

---

## 8. Non Functional Requirements

### 8.1. Hiệu năng
- Thời gian phản hồi các API truy vấn danh sách và Dashboard Admin nhanh ở quy mô dữ liệu trường tiểu học nhờ index trên `(status, due_date)`, `(borrowed_at DESC)`, `(teacher_id, status)` và `(class_year_key, status)`.
- Toàn bộ bảng danh sách phải phân trang phía server (mặc định 20 bản ghi/trang).

### 8.2. Bảo mật
- Mật khẩu lưu dưới dạng băm `scrypt` có salt ngẫu nhiên; tuyệt đối không lưu hoặc log mật khẩu dạng rõ.
- Phiên đăng nhập dùng Cookie `HttpOnly`, `SameSite=Lax` (và `Secure` trên Vercel HTTPS).
- Kiểm tra xác thực và phân quyền RBAC trên **100% API endpoints** ở phía server; Giáo viên không thể xem hoặc sửa phiếu của giáo viên khác qua URL/ID.
- Chống brute-force đăng nhập bền vững trên DB (`login_rate_limits`).
- Toàn bộ đầu vào được kiểm tra hợp lệ ở cả UI và server (`zod`).

### 8.3. Khả năng sử dụng (Usability & Responsive)
- Toàn bộ nhãn, thông báo lỗi, ngày tháng (`DD/MM/YYYY`), hướng dẫn đều bằng **tiếng Việt rõ ràng**, thống nhất thuật ngữ **Giáo vụ** (không còn từ "Văn thư").
- Giao diện Responsive: dùng thuận tiện trên máy tính phòng Giáo vụ lẫn điện thoại giáo viên; chuyển đổi mượt giữa chế độ **Mượn cả lớp** và **Mượn riêng lẻ** ngay trên form mượn.
- Khu vực **Danh sách đỏ** dùng màu sắc tương phản tốt kèm nhãn chữ/biểu tượng (`Quá hạn X ngày`) và phân biệt rõ badge **`Cả lớp`** / **`Riêng lẻ`**.

### 8.4. Độ tin cậy & Sao lưu
- Chạy trên Vercel (`sin1`) + Turso Cloud (`libSQL`) với migration idempotent, tuần tự hóa giao dịch ghi (`withWriteTransaction`) và sao lưu đám mây của Turso.

---

## 9. Acceptance Criteria

- **AC-01 (Tạo tài khoản & Đăng nhập):** Admin (Giáo vụ) tạo được tài khoản giáo viên mới (gồm họ tên, SĐT, lớp/tổ chuyên môn). Giáo viên đăng nhập thành công bằng tài khoản đó; tài khoản bị khóa bị từ chối đăng nhập ngay và phiên cũ không còn truy cập được API.
- **AC-02 (Đổi mật khẩu & Reset mật khẩu):** Người dùng đổi được mật khẩu cá nhân; Admin đặt lại mật khẩu cho giáo viên làm vô hiệu hóa phiên cũ của giáo viên đó.
- **AC-03 (Tạo phiếu mượn riêng lẻ hợp lệ):** Giáo viên chọn **Mượn riêng lẻ**, nhập `Lớp`, `Tên học sinh`, `Niên khóa` (vd `3A`, `Nguyễn Văn An`, `2025-2026`), hạn trả hợp lệ và gửi thành công; phiếu mới có `loanType = 'INDIVIDUAL'`, `quantity = null`, lưu đủ snapshot thông tin giáo viên, `borrowed_at`, `due_date` và trạng thái `BORROWED`.
- **AC-04 (Chống mượn trùng học sinh lẻ):** Khi phiếu riêng lẻ cho học bạ `3A` + `Nguyễn Văn An` + `2025-2026` đang ở trạng thái `BORROWED`, bất kỳ giáo viên nào khác nhập lại (kể cả khác hoa/thường hoặc dư khoảng trắng) đều bị chặn `409 Conflict` kèm thông báo nêu người đang giữ.
- **AC-05 (Giới hạn ngày hẹn trả):** Chọn `due_date` trước ngày mượn hoặc vượt quá `max_loan_days` bị từ chối ở cả UI và API (`400 Bad Request`).
- **AC-06 (Quy tắc Danh sách đỏ):** Mọi phiếu `BORROWED` (cả `WHOLE_CLASS` lẫn `INDIVIDUAL`) có `due_date < todayVN` (`overdue_days >= 1`) bắt buộc xuất hiện trong **Danh sách đỏ** trên Dashboard Admin; phiếu có `due_date == todayVN` (`overdue_days == 0`) KHÔNG nằm trong Danh sách đỏ.
- **AC-07 (Theo dõi theo thời gian mượn):** Admin lọc được khoảng ngày mượn (Từ ngày – Đến ngày) và sắp xếp theo thời gian mượn mới nhất / cũ nhất chính xác.
- **AC-08 (Theo dõi theo độ lố hạn cần lưu ý):** Admin xem được danh sách phân nhóm đúng ngưỡng (`>= 8` ngày Nghiêm trọng, `4–7` ngày Vừa, `1–3` ngày Nhẹ, `-2..0` ngày Sắp đến hạn/Hôm nay) và sắp xếp giảm dần theo số ngày lố hạn.
- **AC-09 (Chỉ Admin xác nhận trả):** Giáo viên gọi API xác nhận trả bị từ chối `403 Forbidden`. Admin bấm Xác nhận trả thành công làm phiếu (cả lớp hoặc riêng lẻ) chuyển sang `RETURNED`, lưu `returned_at` và `returned_by_admin_id`, biến mất khỏi Danh sách đỏ và giải phóng lớp/học bạ để mượn lại.
- **AC-10 (Hủy phiếu nhập nhầm):** Admin hủy phiếu `BORROWED` bắt buộc nhập lý do; phiếu chuyển sang `CANCELLED` (không bị xóa khỏi DB) và giải phóng khóa chống trùng.
- **AC-11 (Cô lập dữ liệu Giáo viên):** Giáo viên gọi API hoặc truy cập giao diện chỉ xem được phiếu của chính mình; không thể truy cập Dashboard Admin, danh sách người dùng hoặc audit log (`403 Forbidden`).
- **AC-12 (Cấu hình hạn mượn):** Admin đổi `default_loan_days` thì form mượn mới ngay lập tức gợi ý hạn trả mới và không làm thay đổi `due_date` của các phiếu đã tạo trước đó.
- **AC-13 (Audit Log):** Toàn bộ thao tác trọng yếu (bao gồm mượn cả lớp/riêng lẻ với `loanType` & `quantity`) đều ghi đầy đủ trong `audit_logs` và hiển thị được ở trang Nhật ký.
- **AC-14 (Định dạng niên khóa & chặn mượn hộ):** Nhập `school_year` sai định dạng bị từ chối `400 Bad Request`; `ADMIN` gọi `POST /api/loans` bị từ chối `403 Forbidden`; `TEACHER` gửi kèm `teacher_id` khác không thể mượn hộ.
- **AC-15 (Mượn toàn bộ 1 lớp, chặn trùng chéo 2 chiều & thuật ngữ Giáo vụ):**
  - Giáo viên chọn **Mượn toàn bộ 1 lớp**, nhập `Lớp = 3A`, `Niên khóa = 2025-2026`, `Số lượng = 35` (hoặc để trống) → tạo phiếu `201` với `loanType = 'WHOLE_CLASS'`, `studentName = 'Toàn bộ lớp'`, `quantity = 35` (hoặc `null`); không bắt buộc nhập `studentName`.
  - Khi phiếu `WHOLE_CLASS` của `3A (2025-2026)` đang `BORROWED`: mọi yêu cầu mượn `WHOLE_CLASS` hoặc `INDIVIDUAL` (bất kỳ học sinh nào) của `3A (2025-2026)` đều bị chặn `409 DUPLICATE_ACTIVE_LOAN`; nhưng mượn lớp khác (`3B`, `2025-2026`) hoặc niên khóa khác (`3A`, `2024-2025`) vẫn hợp lệ `201`.
  - Khi đang có `>= 1` phiếu `INDIVIDUAL` của `3A (2025-2026)` đang `BORROWED`: yêu cầu mượn `WHOLE_CLASS` của `3A (2025-2026)` bị chặn `409 DUPLICATE_ACTIVE_LOAN` (báo rõ số học bạ lẻ chưa trả); sau khi Giáo vụ xác nhận trả/hủy hết phiếu lẻ đó, mượn `WHOLE_CLASS` lại thành công `201`.
  - Admin lọc được theo `loanType=WHOLE_CLASS` hoặc `loanType=INDIVIDUAL` trên `GET /api/loans` và giao diện không còn hiển thị từ `"Văn thư"` (đã đổi sang `"Giáo vụ"`).

---

## 10. Out Of Scope

Các hạng mục sau **KHÔNG** thực hiện trong phiên bản hiện tại:
- Trả từng phần (partial return) đối với phiếu mượn toàn bộ lớp — phiếu mượn cả lớp được trả trọn bộ trong 1 lần xác nhận.
- Import danh sách học sinh toàn trường từ Excel hoặc đồng bộ từ hệ thống bên ngoài (CSDL ngành / vnEdu / SMAS).
- Xuất báo cáo Excel / PDF hoặc in phiếu mượn giấy / mã vạch QR.
- Gửi thông báo tự động qua Zalo OA, SMS hoặc Email.
- Luồng giáo viên gửi yêu cầu gia hạn hoặc tự chỉnh sửa hạn trả sau khi đã tạo phiếu.

---

## 11. Quyết định đã chốt (2026-11-24)

1. **Giới hạn tối đa số ngày được chọn khi mượn (`max_loan_days`):** Mặc định **`30 ngày`**.
2. **Quyền tạo phiếu mượn hộ của Admin:** **Không cho phép mượn hộ** (`TEACHER` only).
3. **Ngưỡng phân mức độ lố hạn:** Nhẹ `1–3 ngày`, Vừa `4–7 ngày`, Nghiêm trọng `>= 8 ngày` (kèm nhóm lưu ý "Sắp đến hạn" `-2..-1` ngày và "Đến hạn hôm nay" `0` ngày).
4. **Định dạng `Niên khóa`:** **Bắt buộc `YYYY-YYYY`** (`năm_sau > năm_trước`, chênh lệch `1..10` năm).

## 12. Quyết định cập nhật (2026-11-26)

1. **Đổi thuật ngữ:** Thống nhất đổi `"Văn thư"` → `"Giáo vụ"` trên toàn bộ giao diện, thông báo lỗi, cấu hình seed mặc định (`Giáo vụ nhà trường`) và tài liệu.
2. **Hai loại mượn (`loan_type`):** Hỗ trợ **`WHOLE_CLASS`** (Mượn toàn bộ 1 lớp: `Lớp + Niên khóa + Số lượng tùy chọn 1..200`) và **`INDIVIDUAL`** (Mượn riêng lẻ: `Lớp + Tên học sinh + Niên khóa`).
3. **Chặn trùng chéo 2 chiều:** Cùng `(Lớp, Niên khóa)`: đang mượn cả lớp thì chặn mọi phiếu lẻ; đang có phiếu lẻ chưa trả thì chặn phiếu mượn cả lớp.
4. **Trả phiếu cả lớp:** Giáo vụ xác nhận trả trọn bộ 1 lần như quy trình hiện tại.
