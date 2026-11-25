> Status: Approved (2026-11-24)

# Spec: Quản lý Mượn – Trả Học Bạ Trường Tiểu Học

- **Mã feature:** `quan-ly-muon-tra-hoc-ba`
- **Tài liệu liên quan:**
  - [`docs/vision/vision.md`](../../vision/vision.md)
  - [`docs/product/product.md`](../../product/product.md)
  - [`docs/architecture/architecture.md`](../../architecture/architecture.md)
  - ADR `Accepted`: [`001`](../../architecture/decisions/001-tech-stack-va-co-so-du-lieu.md), [`002`](../../architecture/decisions/002-co-che-xac-thuc-va-phan-quyen.md), [`003`](../../architecture/decisions/003-dinh-danh-hoc-ba-va-quy-tac-qua-han.md)

---

## 1. Goal

Xây dựng ứng dụng web nội bộ đơn giản, rõ ràng bằng tiếng Việt để quản lý quy trình **mượn và trả học bạ** tại văn phòng Trường Tiểu học, với 2 vai trò **Admin (văn thư)** và **Giáo viên**:
- Giáo viên tự tạo phiếu mượn học bạ bằng cách nhập định danh **Lớp + Tên học sinh + Niên khóa**, hệ thống tự lưu thông tin giáo viên, ngày mượn, hạn trả và ngăn mượn trùng nếu học bạ chưa được trả.
- Chỉ Admin được xác nhận đã trả học bạ khi thu hồi sổ giấy.
- Dashboard Admin làm nổi bật ngay **Danh sách đỏ** gồm các học bạ lố hạn trả (`>= 1` ngày), đồng thời cho phép Admin theo dõi đầy đủ:
  1. **Danh sách mượn** (tất cả / theo trạng thái),
  2. **Danh sách theo thời gian mượn**,
  3. **Danh sách theo độ lố hạn cần lưu ý**.

---

## 2. Business Context

- Tại Trường Tiểu học, học bạ gốc của học sinh được lưu trữ tập trung tại phòng văn thư. Giáo viên chủ nhiệm hoặc giáo viên phụ trách hồ sơ thường xuyên cần mượn học bạ để kiểm tra, ghi nhận xét cuối năm, làm thủ tục chuyển trường hoặc đối chiếu hồ sơ.
- Nếu không quản lý chặt chẽ, văn thư khó biết ai đang giữ học bạ của em nào và đặc biệt dễ bỏ sót những bộ mượn quá hạn nhiều ngày.
- Hệ thống thay thế sổ ghi tay bằng công cụ số hóa gọn nhẹ, sử dụng được cả trên máy tính văn phòng lẫn trình duyệt điện thoại của giáo viên.

---

## 3. User Stories

### Nhóm Tài khoản & Xác thực
- **US-01:** Là **Admin**, tôi muốn tạo, cập nhật, khóa/mở khóa và đặt lại mật khẩu cho tài khoản giáo viên (kèm họ tên, SĐT, lớp/tổ chuyên môn) để kiểm soát đúng người được phép mượn học bạ.
- **US-02:** Là **Giáo viên / Admin**, tôi muốn đăng nhập bằng tên đăng nhập và mật khẩu, cũng như tự đổi mật khẩu của mình để bảo mật tài khoản.

### Nhóm Giáo viên mượn & theo dõi học bạ
- **US-03:** Là **Giáo viên**, tôi muốn tạo phiếu mượn nhanh bằng cách nhập `Lớp`, `Tên học sinh`, `Niên khóa`, chọn `Hạn trả` (đã điền sẵn mặc định) và ghi chú lý do mượn để không phải viết sổ giấy.
- **US-04:** Là **Giáo viên**, tôi muốn được hệ thống cảnh báo ngay nếu học bạ tôi định mượn hiện đang có người khác giữ chưa trả, để tránh mất thời gian tìm kiếm hoặc mượn trùng.
- **US-05:** Là **Giáo viên**, tôi muốn xem danh sách các học bạ mình đang mượn (thấy rõ cuốn nào sắp đến hạn hoặc đã lố hạn) và lịch sử các cuốn mình đã trả.

### Nhóm Admin theo dõi Dashboard, Danh sách đỏ & Xác nhận trả
- **US-06:** Là **Admin**, ngay khi mở Dashboard, tôi muốn nhìn thấy **Danh sách đỏ** chứa tất cả các học bạ đã lố hạn trả (`>= 1` ngày) cùng tên giáo viên, SĐT và số ngày trễ để gọi nhắc thu hồi ngay.
- **US-07:** Là **Admin**, tôi muốn xem và tìm kiếm **Danh sách mượn** theo tên học sinh, lớp, niên khóa, giáo viên mượn hoặc trạng thái (Đang mượn / Đã trả / Đã hủy).
- **US-08:** Là **Admin**, tôi muốn xem **Danh sách theo thời gian mượn** (lọc theo khoảng ngày mượn, sắp xếp mới nhất hoặc cũ nhất) để kiểm soát lượng hồ sơ xuất kho theo ngày/tuần.
- **US-09:** Là **Admin**, tôi muốn xem **Danh sách theo độ lố hạn cần lưu ý** được phân mức rõ ràng (Nghiêm trọng / Vừa / Nhẹ và nhóm Sắp đến hạn) và sắp xếp từ mức lố hạn cao nhất xuống thấp nhất để ưu tiên xử lý.
- **US-10:** Là **Admin**, khi giáo viên mang sổ giấy trả lại văn phòng, tôi muốn bấm **Xác nhận đã trả** (và ghi chú tình trạng sổ nếu cần) để đóng phiếu mượn.
- **US-11:** Là **Admin**, tôi muốn cấu hình số ngày mượn mặc định của trường (vd: 7 ngày) và số ngày mượn tối đa cho phép.
- **US-12:** Là **Admin**, tôi muốn hủy phiếu mượn nhập nhầm (bắt buộc nhập lý do) và xem nhật ký thao tác để đối chiếu khi có sai sót.

---

## 4. Functional Requirements

### FR-01: Đăng nhập, đăng xuất & đổi mật khẩu
- Đăng nhập bằng `username` (không phân biệt hoa/thường) và `password`.
- Tài khoản bị khóa (`is_active = 0`) không thể đăng nhập; nếu đang đăng nhập mà bị khóa thì phiên lập tức hết hiệu lực.
- Hỗ trợ đăng xuất và đổi mật khẩu cá nhân (nhập mật khẩu hiện tại + mật khẩu mới). Nếu `must_change_password = 1`, giao diện nhắc và điều hướng đổi mật khẩu trước khi thao tác tiếp.

### FR-02: Quản lý tài khoản Giáo viên (chỉ Admin)
- Admin xem danh sách tài khoản, lọc theo trạng thái hoạt động/đã khóa, tìm theo họ tên/tên đăng nhập/SĐT/lớp-tổ.
- Admin tạo tài khoản mới: `username` (duy nhất), `full_name` (bắt buộc), `role` (`TEACHER` mặc định hoặc `ADMIN`), `phone`, `unit` (Lớp/Tổ chuyên môn), `password` tạm (bắt buộc đổi khi đăng nhập nếu bật tùy chọn).
- Admin chỉnh sửa `full_name`, `phone`, `unit`, trạng thái `is_active` và thực hiện **Đặt lại mật khẩu** cho giáo viên (hệ thống hủy các phiên đang đăng nhập của tài khoản đó).
- Không cho phép Admin tự khóa chính tài khoản mình đang đăng nhập hoặc hạ/khóa tài khoản Admin hoạt động duy nhất cuối cùng.

### FR-03: Cấu hình hạn mượn mặc định (chỉ Admin)
- Admin xem và chỉnh sửa:
  - `default_loan_days`: số ngày mượn mặc định tính từ ngày mượn (mặc định khởi tạo: `7`, khoảng hợp lệ `1..90`).
  - `max_loan_days`: số ngày tối đa giáo viên được chọn làm hạn trả (mặc định khởi tạo: `30`, phải `>= default_loan_days`).

### FR-04: Tạo phiếu mượn học bạ
- Người dùng nhập:
  - `class_name` (Lớp, bắt buộc, 1–30 ký tự, vd: `3A`, `5/2`)
  - `student_name` (Tên học sinh, bắt buộc, 2–100 ký tự)
  - `school_year` (Niên khóa, bắt buộc đúng định dạng chuẩn `YYYY-YYYY`, vd: `2025-2026` cho năm học đơn hoặc `2021-2026` cho khóa tiểu học 5 năm; hệ thống tự chuẩn hóa dấu gạch nối dài `–`/`—` và khoảng trắng quanh `-` trước khi kiểm tra regex `^\d{4}-\d{4}$`, đồng thời ràng buộc `năm_sau > năm_trước` và `1 <= năm_sau - năm_trước <= 10`)
  - `due_date` (Hạn ngày trả `YYYY-MM-DD`, tự động điền sẵn = `ngày mượn VN + default_loan_days`; người mượn có thể chỉnh nhưng không được trước ngày mượn và không vượt quá `ngày mượn VN + max_loan_days`)
  - `borrow_note` (Ghi chú/Lý do mượn, tùy chọn, tối đa 300 ký tự)
- **Không cho phép mượn hộ:** Chỉ tài khoản có vai trò `TEACHER` được tạo phiếu mượn cho chính mình; không cho phép Admin hay bất kỳ ai tạo phiếu mượn hộ giáo viên khác. `teacher_id` luôn lấy từ phiên đăng nhập phía server; từ chối hoặc bỏ qua mọi trường `teacher_id` gửi từ client.
- Hệ thống tự động lưu:
  - `teacher_id` + snapshot thông tin giáo viên (`teacher_name_snapshot`, `teacher_phone_snapshot`, `teacher_unit_snapshot`),
  - `borrowed_at` = thời điểm tạo phiếu trên server,
  - `status` = `BORROWED`.

### FR-05: Chống mượn trùng học bạ đang lưu hành
- Trước và trong khi ghi phiếu mới, hệ thống chuẩn hóa `(class_name, student_name, school_year)` thành `record_identity_key`.
- Nếu tồn tại phiếu có cùng `record_identity_key` đang ở `status = 'BORROWED'`, từ chối tạo phiếu với HTTP `409 Conflict` và trả thông báo tiếng Việt nêu rõ học bạ đang được giáo viên nào mượn, ngày mượn và hạn trả (định dạng `DD/MM/YYYY`). Để bảo đảm cô lập dữ liệu giữa giáo viên, payload chi tiết `error.details.existingLoan` chỉ trả các trường tối thiểu `{ teacherNameSnapshot, borrowedAt, dueDate }` (không lộ SĐT hoặc ghi chú mượn của giáo viên khác).
- Nếu phiếu cũ đã ở trạng thái `RETURNED` hoặc `CANCELLED`, cho phép tạo phiếu mượn mới bình thường.

### FR-06: Theo dõi phiếu mượn phía Giáo viên
- Giáo viên xem được 2 tab hoặc bộ lọc (phân trang phía server, mặc định 20 bản ghi/trang):
  - **Đang mượn:** các phiếu `BORROWED` của chính giáo viên đó (`status=BORROWED`), đánh dấu cảnh báo màu đỏ nếu đang lố hạn, màu vàng nếu sắp đến hạn/đến hạn hôm nay.
  - **Lịch sử đã trả / đã hủy:** các phiếu `RETURNED` và `CANCELLED` của chính giáo viên đó (`status=HISTORY` trên `GET /api/loans`).
- Cho phép tìm kiếm nhanh theo tên học sinh, lớp, niên khóa.

### FR-07: Dashboard Admin & Danh sách đỏ quá hạn
- Trang chủ Admin hiển thị các thẻ thống kê (KPI) trực quan theo thời gian thực:
  1. **Đang mượn (Tổng)** (`status = 'BORROWED'`)
  2. **Danh sách đỏ — Quá hạn trả** (`status = 'BORROWED'` và `overdue_days >= 1`)
  3. **Sắp đến hạn / Đến hạn hôm nay** (`-2 <= overdue_days <= 0`)
  4. **Đã trả trong tháng / tuần**
- Ngay bên dưới KPI là khu vực **Danh sách đỏ (Cần thu hồi ngay)** được thiết kế nổi bật (viền/nhãn cảnh báo đỏ), liệt kê toàn bộ phiếu có `overdue_days >= 1`, mặc định sắp xếp giảm dần theo `overdue_days` (lố hạn lâu nhất lên trên cùng), hiển thị đầy đủ:
  - Học bạ (`Lớp` – `Tên học sinh` – `Niên khóa`)
  - Giáo viên mượn (`Họ tên` – `Lớp/Tổ` – `SĐT`)
  - `Ngày mượn`, `Hạn trả`, badge **`Quá hạn X ngày`** + mức cảnh báo
  - Nút hành động nhanh **Xác nhận đã trả**.

### FR-08: Danh sách mượn đầy đủ (Admin)
- Bảng tổng hợp tất cả phiếu mượn hỗ trợ:
  - Tìm kiếm tự do theo: tên học sinh, lớp, niên khóa, họ tên giáo viên.
  - Lọc theo trạng thái: Tất cả / Đang mượn / Đang quá hạn / Đã trả / Đã hủy.
  - Lọc theo giáo viên, lớp hoặc niên khóa.
  - Phân trang (mặc định 20 dòng/trang) và hiển thị chi tiết phiếu (người mượn, ngày mượn, hạn trả, người xác nhận trả, ngày trả, ghi chú).

### FR-09: Danh sách theo thời gian mượn (Admin)
- Chế độ xem chuyên biệt theo dòng thời gian mượn (`borrowed_at`):
  - Bộ lọc nhanh khoảng thời gian: Hôm nay / 7 ngày qua / 30 ngày qua / Tháng này / Tùy chọn `Từ ngày` – `Đến ngày`.
  - Chọn chiều sắp xếp: Mới mượn gần nhất (`borrowed_at DESC`) hoặc Mượn lâu nhất trước (`borrowed_at ASC`).
  - Hiển thị rõ mốc ngày – giờ mượn theo giờ Việt Nam (`DD/MM/YYYY HH:mm`) cùng trạng thái trả hiện tại của từng phiếu.

### FR-10: Danh sách theo độ lố hạn cần lưu ý (Admin)
- Chế độ xem phân tầng ưu tiên các phiếu đang mượn theo mức độ cấp bách (tính theo ngày lịch Việt Nam):
  - **Mức 1 — Quá hạn nghiêm trọng (`overdue_days >= 8` ngày):** Màu đỏ đậm
  - **Mức 2 — Quá hạn vừa (`4 <= overdue_days <= 7` ngày):** Màu đỏ
  - **Mức 3 — Quá hạn nhẹ (`1 <= overdue_days <= 3` ngày):** Màu cam đỏ
  - *(Tùy chọn lọc kèm)* **Nhóm lưu ý sắp hạn (`-2 <= overdue_days <= 0` ngày):** Đến hạn hôm nay hoặc còn 1–2 ngày tới hạn (màu vàng hổ phách) để văn thư nhắc sớm.
- Cho phép lọc từng nhóm mức độ, sắp xếp mặc định theo `overdue_days DESC`, sau đó đến `borrowed_at ASC`, kèm số lượng thống kê từng nhóm và thông tin liên hệ giáo viên.

### FR-11: Xác nhận trả học bạ (chỉ Admin)
- Chỉ Admin có quyền thực hiện thao tác trên phiếu có `status = 'BORROWED'`.
- Admin có thể nhập `return_note` (tùy chọn, vd: "Đã đủ chữ ký, sổ nguyên vẹn").
- Khi xác nhận: chuyển `status = 'RETURNED'`, lưu `returned_at` (thời điểm hiện tại), `returned_by_admin_id`, `return_note`, và ghi `audit_logs`.
- Không cho phép xác nhận trả lại một phiếu đã `RETURNED` hoặc `CANCELLED` (trả về lỗi `409 Conflict`).

### FR-12: Hủy phiếu nhập nhầm & Nhật ký kiểm toán (chỉ Admin)
- Chỉ Admin được hủy phiếu đang ở trạng thái `BORROWED` khi phát hiện tạo nhầm thông tin (`status` → `CANCELLED`), bắt buộc nhập `cancel_reason` (tối thiểu 3 ký tự). Không xóa vật lý bản ghi khỏi cơ sở dữ liệu.
- Admin xem được trang **Nhật ký thao tác** (`audit_logs`) hiển thị thời gian, người thực hiện, hành động, đối tượng và chi tiết thay đổi.

---

## 5. Business Rules

- **BR-01 (Định danh học bạ):** Mọi học bạ khi mượn bắt buộc có đủ 3 thông tin: `Lớp`, `Tên học sinh`, `Niên khóa`. Trong đó `Niên khóa` bắt buộc tuân thủ định dạng `YYYY-YYYY` (tự chuẩn hóa khoảng trắng quanh dấu `-` và dấu gạch ngang `–`/`—` trước khi kiểm tra; `năm_sau > năm_trước` và chênh lệch `1..10` năm).
- **BR-02 (Chống mượn trùng theo khóa chuẩn hóa):** Chuẩn hóa chuỗi (`NFC`, trim, gộp khoảng trắng, lowercase `vi-VN`, chuẩn hóa dấu `-` ở niên khóa) tạo `record_identity_key`. Hệ thống chỉ cho phép tối đa 1 phiếu có `status = 'BORROWED'` cho mỗi `record_identity_key` tại một thời điểm (cưỡng chế ở tầng DB bằng Partial Unique Index).
- **BR-03 (Bất biến lịch sử người mượn):** Thông tin giáo viên (`Họ tên`, `SĐT`, `Lớp/Tổ chuyên môn`) phải được chụp (snapshot) vào phiếu mượn tại thời điểm tạo để không bị sai lệch lịch sử nếu tài khoản giáo viên được cập nhật về sau.
- **BR-04 (Quy tắc ngày mượn & hạn trả):**
  - Ngày mượn `borrowed_at` do hệ thống tự ghi theo đồng hồ server, không cho phép người dùng tự sửa lùi/tới ngày mượn.
  - Hạn trả `due_date` mặc định = `ngày mượn (giờ VN) + default_loan_days`. Nếu người mượn tự chọn ngày khác, phải thỏa `ngày mượn (giờ VN) <= due_date <= ngày mượn (giờ VN) + max_loan_days`.
- **BR-05 (Quy tắc tính quá hạn & Danh sách đỏ):**
  - Múi giờ chuẩn là `Asia/Ho_Chi_Minh`.
  - Phiếu được tính là **lố hạn / quá hạn** khi `status = 'BORROWED'` và `todayVN > due_date` (tức `overdue_days >= 1`).
  - Mọi phiếu thỏa điều kiện trên tự động xuất hiện trong **Danh sách đỏ** trên Dashboard Admin mà không phụ thuộc job chạy ngầm.
- **BR-06 (Phân mức độ lố hạn cần lưu ý):**
  - `overdue_days >= 8`: Quá hạn nghiêm trọng (`CRITICAL`).
  - `4 <= overdue_days <= 7`: Quá hạn vừa (`MODERATE`).
  - `1 <= overdue_days <= 3`: Quá hạn nhẹ (`MILD`).
  - `overdue_days == 0`: Đến hạn hôm nay (`DUE_TODAY`).
  - `-2 <= overdue_days <= -1`: Sắp đến hạn (`DUE_SOON`).
  - `overdue_days <= -3`: Trong hạn (`ON_TIME`).
- **BR-07 (Thẩm quyền xác nhận trả):** Chỉ `ADMIN` được xác nhận trả học bạ (`BORROWED` → `RETURNED`). Giáo viên tuyệt đối không thể tự đánh dấu đã trả.
- **BR-08 (Không xóa cứng dữ liệu nghiệp vụ):** Phiếu mượn không bị `DELETE` khỏi DB; trường hợp nhập sai chỉ chuyển trạng thái sang `CANCELLED` kèm lý do và người thực hiện.
- **BR-09 (Tài khoản giáo viên bị khóa):** Khi Admin khóa tài khoản giáo viên (`is_active = 0`), giáo viên đó không đăng nhập hoặc tạo phiếu mới được, nhưng các phiếu `BORROWED` trước đó vẫn tiếp tục hiển thị bình thường (và vào Danh sách đỏ nếu quá hạn) để văn thư thu hồi.
- **BR-10 (Bảo vệ quyền Admin cuối cùng):** Không cho phép khóa hoặc hạ quyền tài khoản `ADMIN` hoạt động duy nhất còn lại trong hệ thống.
- **BR-11 (Không cho phép mượn hộ):** Chỉ vai trò `TEACHER` được phép gọi chức năng mượn học bạ (`POST /api/loans`) và phiếu mượn luôn gắn trực tiếp với tài khoản giáo viên đang đăng nhập; `ADMIN` không được tạo phiếu mượn hộ giáo viên khác (`403 Forbidden`).

---

## 6. Permissions

| Chức năng / Tài nguyên | Chưa đăng nhập | Giáo viên (`TEACHER`) | Admin (`ADMIN`) |
| --- | --- | --- | --- |
| Đăng nhập (`/login`, `POST /api/auth/login`) | Cho phép | Cho phép | Cho phép |
| Đăng xuất (`POST /api/auth/logout`) | Cho phép (idempotent 200, xóa cookie) | Cho phép | Cho phép |
| Đổi mật khẩu của bản thân (`POST /api/auth/change-password`) | Từ chối (401) | Cho phép | Cho phép |
| Tạo phiếu mượn học bạ (`POST /api/loans`) | Từ chối (401) | Cho phép (chỉ cho bản thân) | Từ chối (403) — không mượn hộ |
| Xem danh sách & lịch sử mượn **của bản thân** | Từ chối (401) | Cho phép | — (Admin xem toàn trường qua Dashboard/Danh sách mượn) |
| Xem Dashboard Admin, Danh sách đỏ, Danh sách toàn trường | Từ chối (401) | Từ chối (403) | Cho phép |
| Xem Danh sách theo thời gian mượn & Độ lố hạn | Từ chối (401) | Từ chối (403) | Cho phép |
| Xác nhận đã trả học bạ (`POST /api/loans/[id]/return`) | Từ chối (401) | Từ chối (403) | Cho phép |
| Hủy phiếu nhập nhầm (`POST /api/loans/[id]/cancel`) | Từ chối (401) | Từ chối (403) | Cho phép |
| Quản lý tài khoản giáo viên (`/api/users*`) | Từ chối (401) | Từ chối (403) | Cho phép |
| Cấu hình hạn mượn mặc định/tối đa (`PATCH /api/settings`) | Từ chối (401) | Từ chối (403) | Cho phép |
| Xem nhật ký thao tác (`GET /api/audit-logs`) | Từ chối (401) | Từ chối (403) | Cho phép |

---

## 7. Integrations

- **Trong phạm vi MVP:** Không tích hợp dịch vụ bên thứ ba (không phụ thuộc Internet hay API ngoài như SMS, Zalo OA, Email SMTP, Google OAuth) để ứng dụng chạy ổn định ngay cả trong mạng nội bộ nhà trường.
- **Khả năng mở rộng về sau:** Kiến trúc tách domain service và ghi sẵn `audit_logs` cho phép gắn thêm module thông báo (Zalo/Email) hoặc import/export Excel ở các phiên bản sau mà không phải sửa lại bảng `loan_records`.

---

## 8. Non Functional Requirements

### 8.1. Hiệu năng
- Thời gian phản hồi các API truy vấn danh sách và Dashboard Admin dưới `200ms` ở quy mô dữ liệu trường tiểu học (lên tới vài chục nghìn phiếu mượn trong nhiều năm học) nhờ index trên `(status, due_date)`, `(borrowed_at DESC)` và `(teacher_id, status)`.
- Toàn bộ bảng danh sách phải phân trang phía server (mặc định 20 bản ghi/trang).

### 8.2. Bảo mật
- Mật khẩu lưu dưới dạng băm `scrypt` có salt ngẫu nhiên; tuyệt đối không lưu hoặc log mật khẩu dạng rõ.
- Phiên đăng nhập dùng Cookie `HttpOnly`, `SameSite=Lax`.
- Kiểm tra xác thực và phân quyền RBAC trên **100% API endpoints** ở phía server; Giáo viên không thể xem hoặc sửa phiếu của giáo viên khác qua URL/ID.
- Chống brute-force đăng nhập cơ bản (tạm giới hạn khi nhập sai liên tiếp nhiều lần).
- Toàn bộ đầu vào được kiểm tra hợp lệ ở cả UI và server (`zod`).

### 8.3. Khả năng sử dụng (Usability & Responsive)
- Toàn bộ nhãn, thông báo lỗi, ngày tháng (`DD/MM/YYYY`), hướng dẫn đều bằng **tiếng Việt rõ ràng, dễ hiểu với giáo viên tiểu học**.
- Giao diện Responsive: dùng thuận tiện trên màn hình máy tính bàn của văn phòng (bảng chi tiết, bộ lọc đa cột) lẫn màn hình điện thoại di động của giáo viên (form mượn nhanh, thẻ trạng thái rõ ràng).
- Khu vực **Danh sách đỏ** dùng màu sắc tương phản tốt kèm nhãn chữ/biểu tượng (`Quá hạn X ngày`) để người dùng dễ nhận biết ngay lập tức.

### 8.4. Độ tin cậy & Sao lưu
- SQLite chạy chế độ `WAL` kết hợp `busy_timeout` để tránh lỗi khóa DB khi nhiều giáo viên thao tác đồng thời.
- Toàn bộ dữ liệu nằm trong một file SQLite gắn volume bền vững, dễ sao lưu định kỳ.

---

## 9. Acceptance Criteria

- **AC-01 (Tạo tài khoản & Đăng nhập):** Admin tạo được tài khoản giáo viên mới (gồm họ tên, SĐT, lớp/tổ chuyên môn). Giáo viên đăng nhập thành công bằng tài khoản đó; tài khoản bị Admin khóa bị từ chối đăng nhập ngay và phiên cũ không còn truy cập được API.
- **AC-02 (Đổi mật khẩu & Reset mật khẩu):** Người dùng đổi được mật khẩu cá nhân; Admin đặt lại mật khẩu cho giáo viên làm vô hiệu hóa phiên cũ của giáo viên đó.
- **AC-03 (Tạo phiếu mượn hợp lệ):** Giáo viên nhập `Lớp`, `Tên học sinh`, `Niên khóa` (vd `3A`, `Nguyễn Văn An`, `2025-2026`), hệ thống hiển thị sẵn hạn trả mặc định (`+7 ngày`), giáo viên giữ nguyên hoặc chọn ngày khác hợp lệ và gửi thành công; phiếu mới lưu đủ snapshot thông tin giáo viên, `borrowed_at`, `due_date` và trạng thái `BORROWED`.
- **AC-04 (Chống mượn trùng):** Khi phiếu cho học bạ `3A` + `Nguyễn Văn An` + `2025-2026` đang ở trạng thái `BORROWED`, bất kỳ giáo viên nào khác nhập lại (kể cả khác chữ hoa/thường hoặc dư khoảng trắng như ` 3a `, `nguyễn   văn an`, `2025 - 2026`) đều bị chặn với thông báo lỗi rõ ràng nêu người đang giữ.
- **AC-05 (Giới hạn ngày hẹn trả):** Chọn `due_date` trước ngày mượn hoặc vượt quá `max_loan_days` bị từ chối ở cả UI và API (`400 Bad Request`).
- **AC-06 (Quy tắc Danh sách đỏ):** Phiếu `BORROWED` có `due_date` nhỏ hơn ngày hiện tại theo giờ Việt Nam ít nhất 1 ngày (`overdue_days >= 1`) bắt buộc xuất hiện trong **Danh sách đỏ** trên Dashboard Admin; phiếu có `due_date == todayVN` (`overdue_days == 0`) KHÔNG nằm trong Danh sách đỏ mà nằm ở nhóm Đến hạn hôm nay.
- **AC-07 (Theo dõi theo thời gian mượn):** Admin lọc được khoảng ngày mượn (Từ ngày – Đến ngày) và sắp xếp theo thời gian mượn mới nhất / cũ nhất chính xác.
- **AC-08 (Theo dõi theo độ lố hạn cần lưu ý):** Admin xem được danh sách phân nhóm đúng ngưỡng (`>= 8` ngày Nghiêm trọng, `4–7` ngày Vừa, `1–3` ngày Nhẹ, `-2..0` ngày Sắp đến hạn/Hôm nay) và sắp xếp giảm dần theo số ngày lố hạn.
- **AC-09 (Chỉ Admin xác nhận trả):** Giáo viên gọi API xác nhận trả bị từ chối `403 Forbidden`. Admin bấm Xác nhận trả thành công làm phiếu chuyển sang `RETURNED`, lưu `returned_at` và `returned_by_admin_id`, biến mất khỏi Danh sách đỏ, và học bạ đó có thể được mượn lại ở lần sau.
- **AC-10 (Hủy phiếu nhập nhầm):** Admin hủy phiếu `BORROWED` bắt buộc nhập lý do; phiếu chuyển sang `CANCELLED` (không bị xóa khỏi DB) và giải phóng khóa chống trùng.
- **AC-11 (Cô lập dữ liệu Giáo viên):** Giáo viên gọi API hoặc truy cập giao diện chỉ xem được phiếu của chính mình; không thể truy cập Dashboard Admin, danh sách người dùng hoặc audit log (`403 Forbidden`).
- **AC-12 (Cấu hình hạn mượn):** Admin đổi `default_loan_days` (vd từ `7` sang `10`) thì form mượn mới ngay lập tức gợi ý hạn trả mới (+10 ngày) và không làm thay đổi `due_date` của các phiếu đã tạo trước đó.
- **AC-13 (Audit Log):** Các thao tác tạo tài khoản, khóa/mở khóa, reset mật khẩu, tạo phiếu, trả phiếu, hủy phiếu, đổi cấu hình đều ghi lại đầy đủ trong `audit_logs` và hiển thị được ở trang Nhật ký của Admin.
- **AC-14 (Định dạng niên khóa & chặn mượn hộ):** Nhập `school_year` sai định dạng (vd `25-26`, `2026-2025`, `2025`, `2010-2025`) bị từ chối `400 Bad Request`; nhập `2025 - 2026` hoặc `2021-2026` được chuẩn hóa và chấp nhận. `ADMIN` gọi `POST /api/loans` bị từ chối `403 Forbidden`; `TEACHER` gửi kèm `teacher_id` khác không thể tạo phiếu dưới danh nghĩa giáo viên khác.

---

## 10. Out Of Scope

Các hạng mục sau **KHÔNG** thực hiện trong phiên bản MVP này:
- Import danh sách học sinh toàn trường từ Excel hoặc đồng bộ từ hệ thống bên ngoài (CSDL ngành / vnEdu / SMAS).
- Xuất báo cáo Excel / PDF hoặc in phiếu mượn giấy / mã vạch QR.
- Gửi thông báo tự động qua Zalo OA, SMS hoặc Email.
- Luồng giáo viên gửi yêu cầu gia hạn hoặc tự chỉnh sửa hạn trả sau khi đã tạo phiếu.
- Quản lý nhiều trường học (multi-tenant) — hệ thống phục vụ một Trường Tiểu học.

---

## 11. Quyết định đã chốt (2026-11-24)

1. **Giới hạn tối đa số ngày được chọn khi mượn (`max_loan_days`):** Chốt mặc định **`30 ngày`** (Admin có thể chỉnh trong Cài đặt).
2. **Quyền tạo phiếu mượn hộ của Admin:** **Không cho phép mượn hộ** — chỉ giáo viên tự đăng nhập tạo phiếu mượn cho chính mình (`TEACHER` only).
3. **Ngưỡng phân mức độ lố hạn:** Chốt ngưỡng Nhẹ `1–3 ngày`, Vừa `4–7 ngày`, Nghiêm trọng `>= 8 ngày` (kèm nhóm lưu ý "Sắp đến hạn" `-2..-1` ngày và "Đến hạn hôm nay" `0` ngày).
4. **Định dạng `Niên khóa`:** **Bắt buộc định dạng `YYYY-YYYY`** (`năm_sau > năm_trước`, chênh lệch `1..10` năm; tự chuẩn hóa khoảng trắng quanh dấu `-` và dấu gạch ngang dài `–`/`—` trước khi kiểm tra).
