> Status: Validated (2026-11-26) — Vòng 4 chốt cuối: 99/99 tests PASS (12/12 files), tsc/eslint/next build PASS; 0 BLOCKER, 0 HIGH, 0 MEDIUM, 0 LOW tồn đọng

# Báo cáo Kiểm chứng (Validation) Vòng 4 — Wave 7: Quản lý Mượn – Trả Học Bạ (`quan-ly-muon-tra-hoc-ba`)

- **Ngày kiểm chứng vòng 4:** 2026-11-26 (kiểm chứng độc lập Wave 7 `T19`–`T23`: đổi thuật ngữ `"Văn thư"` → `"Giáo vụ"`, hỗ trợ 2 loại mượn `WHOLE_CLASS` / `INDIVIDUAL`, chặn trùng chéo 2 chiều và migration `0002` theo **ADR-005 `Accepted`**)
- **Nguồn chân lý đối chiếu:** [`spec.md`](spec.md) (`Approved` 2026-11-26), [`tasks.md`](tasks.md) (`Implemented` Wave 7 `T19`–`T23`), [`architecture.md`](../../architecture/architecture.md) (`Approved` 2026-11-26), ADR [`002`](../../architecture/decisions/002-co-che-xac-thuc-va-phan-quyen.md) / [`003`](../../architecture/decisions/003-dinh-danh-hoc-ba-va-quy-tac-qua-han.md) / [`004`](../../architecture/decisions/004-trien-khai-vercel-va-co-so-du-lieu-turso.md) / [`005`](../../architecture/decisions/005-bo-sung-loai-muon-ca-lop-va-chan-trung-cheo.md) (`Accepted`), [`AGENTS.md`](../../../AGENTS.md).
- **Phương pháp thực hiện:** 2 subagent độc lập mới hoàn toàn cho Vòng 4:
  - **Reviewer Vòng 4 (chỉ đọc):** rà soát toàn bộ `T19`–`T23`, đối chiếu `FR-01..12`, `BR-01..11`, `AC-01..15` và `ADR-005`.
  - **QA Vòng 4 (chỉ sửa file test):** viết mới **15 test hồi quy** chuyên sâu cho Wave 7 tại `src/validation/regression-round4.test.ts` (tương thích ngược, biên `quantity`, chặn trùng chéo 2 chiều & concurrency `Promise.all` 6 request đồng thời, Dashboard/Audit/Search, migration `0002` trên file SQLite thật `/tmp`, thuật ngữ Giáo vụ) và chạy đủ 4 cổng kiểm chứng.

---

## 1. Tóm tắt kết quả qua các vòng kiểm chứng

| Hạng mục | Vòng 3 (chốt cuối) | Vòng 4 — Wave 7 (hiện tại) | Chi tiết Vòng 4 |
| --- | --- | --- | --- |
| **Test tự động (`vitest run`)** | 81/81 PASS (11 files) | **99/99 PASS · 0 FAIL** | **12/12 file test PASS** (gồm 15 test mới tại `regression-round4.test.ts` + 3 test `AC-15`/`0002` tại `acceptance.test.ts` & `db.test.ts`). |
| **TypeScript (`tsc --noEmit`)** | PASS | **PASS** | 0 lỗi kiểu. |
| **Lint (`eslint .`)** | PASS | **PASS** | 0 lỗi, 0 cảnh báo. |
| **Production Build (`next build --webpack`)** | PASS | **PASS** | Biên dịch sạch toàn bộ trang UI & 13 API Route Handlers. |
| **QA Độc lập** | PASS | **PASS (100%)** | Không phát hiện lỗi chức năng, bảo mật hay hồi quy nào (`0 BLOCKER · 0 HIGH · 0 MEDIUM`). |
| **Code Review Độc lập** | 0 BLOCKER · 0 HIGH · 0 MEDIUM | **0 BLOCKER · 0 HIGH · 1 MEDIUM · 5 LOW** | 1 đề xuất quan trọng về tính nguyên tử của backfill trong migration `0002` (`MEDIUM-R4-01`) + 5 tinh chỉnh nhỏ (`LOW-R4-01..05`). |
| **Kết luận nghiệm thu** | `Validated` | **`CONDITIONAL PASS`** | Đạt 15/15 AC, 11/11 BR, 12/12 FR, 100% Permissions; khuyến nghị sửa gọn `MEDIUM-R4-01` trước khi chốt `Validated` & đẩy lên Vercel/Turso. |

---

## 2. Đánh giá từng hạng mục Wave 7 (`T19`–`T23`)

- **T19 (Migration `0002`, Schema & Backfill):** Khớp 100% giữa `0002_loan_type_and_whole_class.sql`, `registry.ts` và `schema.ts` (zero table rebuild); `enrich.ts` ẩn sạch 3 cột nội bộ (`classYearKey`, `searchText`, `classNameNorm`). *(Lưu ý `MEDIUM-R4-01` về thứ tự `commit()` vs backfill).*
- **T20 (Domain, Validator & API `/api/loans*`):** Đạt 100% — tương thích ngược khi bỏ qua `loanType`, ép `quantity=null` với `INDIVIDUAL`, bỏ qua `studentName` giả với `WHOLE_CLASS`, chặn trùng chéo 2 chiều nguyên tử trong `withWriteTransaction` vượt qua bài test đồng thời 6 request `Promise.all`, payload `409 existingLoan` giữ đúng 3 khóa tối thiểu, lọc `loanType` + tìm không dấu `"ca lop"` + `audit_logs` đầy đủ.
- **T21 (Đổi thuật ngữ "Văn thư" → "Giáo vụ"):** Đạt 100% — **0 lần xuất hiện** `"Văn thư"` trên UI, API error, seed default hay tài liệu sản phẩm (chỉ còn 1 comment JSDoc nội bộ `LOW-R4-05`).
- **T22 (UI 2 loại mượn):** Đạt — `BorrowForm` hỗ trợ chuyển đổi trực quan `WHOLE_CLASS`/`INDIVIDUAL` kèm `quantity` tùy chọn; badge `Cả lớp` (+ `X quyển`) / `Riêng lẻ` hiển thị rõ trên `TeacherLoansList`, `RedListPanel`, `LoansTable` (kèm bộ lọc `Loại mượn`) và `ReturnCancelModals`.
- **T23 (Kiểm thử `AC-15` & Migration `0002`):** Đạt — **99/99 tests PASS** trên **12/12 files**.

---

## 3. Danh sách phát hiện Vòng 4

### BLOCKER (`0`) · HIGH (`0`)
Không có.

### MEDIUM (`1`)

1. **`MEDIUM-R4-01` — Backfill `class_year_key` (và `search_text`) chạy ngoài write transaction sau khi đã ghi `_migrations`**
   - **Vị trí:** `src/db/migrate.ts:118-143`.
   - **Nguyên nhân:** `INSERT OR IGNORE INTO _migrations` và `tx.commit()` chạy trước, sau đó mới gọi `backfillClassYearKeys(client)` / `backfillSearchColumns(client)` ở bên ngoài transaction.
   - **Tác động:** Nếu mạng tới Turso bị ngắt giữa chừng lúc đang backfill `0002`, hoặc 2 Vercel Serverless instance cold-start song song đúng lúc nâng cấp, các phiếu `BORROWED` cũ có thể còn `class_year_key = ''` → bỏ lọt kiểm tra chặn trùng chéo 2 chiều.
   - **Khuyến nghị sửa:** Đưa `backfillClassYearKeys(tx)` và `backfillSearchColumns(tx)` vào **bên trong cùng `tx`** ngay trước `INSERT OR IGNORE INTO _migrations` và `tx.commit()`.

### LOW (`5`)

1. **`LOW-R4-01`** (`src/db/index.ts:30-35`): Đổi `code === 'SQLITE_BUSY'` thành `code.startsWith('SQLITE_BUSY')` để bắt luôn mã mở rộng `SQLITE_BUSY_SNAPSHOT` của Turso đa instance.
2. **`LOW-R4-02`** (`src/components/admin/ReturnCancelModals.tsx:62-66,186-190`): Bổ sung badge `Riêng lẻ` ở 2 modal trả/hủy để đồng bộ với các bảng danh sách.
3. **`LOW-R4-03`** (`src/components/admin/TeacherManagerClient.tsx:397`): Đổi nhãn `${u.activeLoanCount} cuốn` → `${u.activeLoanCount} phiếu` (vì 1 phiếu `WHOLE_CLASS` có thể chứa nhiều quyển).
4. **`LOW-R4-04`** (`src/lib/domain/record-identity.ts:81-90`): Dùng chung helper chuẩn hóa `schoolYear` (gạch ngang dài & khoảng trắng) cho cả `buildClassYearKey` và `buildRecordIdentityKey`.
5. **`LOW-R4-05`** (`src/lib/domain/search.ts:17`, `docs/architecture/architecture.md:146-154`, `README.md:14`): Sửa nốt 1 comment nội bộ `"văn thư/giáo viên"` → `"giáo vụ/giáo viên"` và đồng bộ nhẹ mục `3.1` trong `architecture.md` + `README.md`.

---

## 4. Kết quả khắc phục & Chốt nghiệm thu Vòng 4 (2026-11-26)

- **Đã khắc phục triệt để toàn bộ 6 mục sau review:**
  - `MEDIUM-R4-01` (`src/db/migrate.ts`): chuyển `backfillSearchColumns(tx)` và `backfillClassYearKeys(tx)` vào bên trong cùng `write transaction` ngay trước `INSERT OR IGNORE INTO _migrations` và `tx.commit()`.
  - `LOW-R4-01` (`src/db/index.ts`): đổi kiểm tra mã lỗi bận sang `code.startsWith('SQLITE_BUSY')` (bắt thêm `SQLITE_BUSY_SNAPSHOT`).
  - `LOW-R4-02` (`src/components/admin/ReturnCancelModals.tsx`): bổ sung badge `Riêng lẻ` song song với badge `Cả lớp` trên cả 2 modal Trả và Hủy.
  - `LOW-R4-03` (`src/components/admin/TeacherManagerClient.tsx`): đổi đơn vị cột đang mượn từ `cuốn` sang `phiếu`.
  - `LOW-R4-04` (`src/lib/domain/record-identity.ts`): trích helper dùng chung `normalizeSchoolYearRaw` cho `normalizeAndValidateSchoolYear`, `buildClassYearKey` và `buildRecordIdentityKey`.
  - `LOW-R4-05` (`src/lib/domain/search.ts`, `docs/architecture/architecture.md`, `README.md`): sửa nốt comment nội bộ `"văn thư"` → `"giáo vụ"`, đồng bộ mục `3.1` (`WHOLE_CLASS`/`class_year_key`) và thêm bộ lọc `"loại mượn"` trong `README.md`.
- **Kiểm chứng lại sau khi sửa (toàn bộ 4 cổng PASS):**
  - `vitest run`: **12/12 files — 99/99 tests PASS**.
  - `tsc --noEmit`: **PASS (0 lỗi)**.
  - `eslint .`: **PASS (0 lỗi, 0 cảnh báo)**.
  - `next build --webpack`: **PASS**.
- **Trạng thái chốt:** **`Validated (2026-11-26)`** — Sẵn sàng để chủ dự án commit/push lên Git và deploy Vercel (với region `sin1` + Turso Cloud).
