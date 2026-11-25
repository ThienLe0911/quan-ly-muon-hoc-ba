> Status: Validated (2026-11-25) — PASS toàn diện (0 BLOCKER, 0 HIGH, 0 MEDIUM, 0 LOW; 81/81 tests PASS, tsc/eslint/next build PASS)

# Báo cáo Kiểm chứng (Validation) Vòng 3 & Nghiệm thu: Quản lý Mượn – Trả Học Bạ (`quan-ly-muon-tra-hoc-ba`)

- **Ngày chốt nghiệm thu (`Validated`):** 2026-11-25 (theo phê duyệt của chủ dự án sau khi hoàn tất sửa toàn bộ 4 `MEDIUM` & 4 `LOW` của Vòng 3)
- **Nguồn chân lý đối chiếu:** [`spec.md`](spec.md) (`Validated`), [`tasks.md`](tasks.md) (`Validated`), [`architecture.md`](../../architecture/architecture.md) (`Approved` 2026-11-25), ADR [`002`](../../architecture/decisions/002-co-che-xac-thuc-va-phan-quyen.md) / [`003`](../../architecture/decisions/003-dinh-danh-hoc-ba-va-quy-tac-qua-han.md) / [`004`](../../architecture/decisions/004-trien-khai-vercel-va-co-so-du-lieu-turso.md) (`Accepted`, thay thế ADR [`001`](../../architecture/decisions/001-tech-stack-va-co-so-du-lieu.md)), [`AGENTS.md`](../../../AGENTS.md).
- **Phương pháp thực hiện:**
  - 2 subagent độc lập cho Vòng 3 (**Reviewer Vòng 3** chỉ đọc & **QA Engineer Vòng 3** viết thêm 15 bài kiểm thử hồi quy Vercel + Turso tại `src/validation/regression-round3.test.ts`).
  - Khắc phục triệt để toàn bộ 4 mục `MEDIUM-R3-01..04` và 4 mục `LOW-R3-01..04`, bổ sung test kiểm chứng seed an toàn trên Vercel trong `src/db/db.test.ts`, chạy lại toàn bộ bộ kiểm chứng tự động (`vitest`, `tsc`, `eslint`, `next build --webpack`, CLI `migrate`/`seed`).

---

## 1. Tóm tắt kết quả qua các vòng kiểm chứng

| Hạng mục | Vòng 1 | Vòng 2 | Vòng 3 (độc lập) | Chốt cuối (`Validated`) |
| --- | --- | --- | --- | --- |
| **Test tự động (`vitest run`)** | 41/42 PASS | 64/64 PASS | 79/80 PASS · 1 FAIL | **81/81 PASS · 0 FAIL** (11/11 file test PASS) |
| **TypeScript (`tsc --noEmit`)** | PASS | PASS | PASS | **PASS (0 lỗi)** |
| **Lint (`eslint .`)** | PASS | PASS | PASS | **PASS (0 lỗi, 0 cảnh báo)** |
| **Production Build (`next build --webpack`)** | PASS | PASS | PASS | **PASS (21/21 routes)** |
| **CLI Migration & Seed (`tsx`)** | PASS | PASS | PASS | **PASS (idempotent, tách biệt migrate & seed)** |
| **Gỡ Docker & `better-sqlite3`** | — | Chưa gỡ | PASS | **PASS (sạch 100%)** |
| **Phát hiện còn tồn đọng** | 4 HIGH · 13 MEDIUM | 0 HIGH · 4 MEDIUM | 0 HIGH · 4 MEDIUM · 4 LOW | **0 BLOCKER · 0 HIGH · 0 MEDIUM · 0 LOW** |
| **Kết luận** | Conditional Fail | Conditional Fail | Conditional Fail | **`VALIDATED` (ĐẠT TOÀN DIỆN)** |

---

## 2. Xác minh khắc phục toàn bộ tồn đọng Vòng 2 & Vòng 3

### 2.1. Các mục Vòng 2 (`4/4 ĐÃ KHẮC PHỤC`)
| Mã | Trạng thái | Bằng chứng xác minh (`file:dòng`) |
| --- | --- | --- |
| **`MEDIUM-R2-01`** | **ĐÃ KHẮC PHỤC** | Chặn `setLoading(true)` thừa khi bấm lại tab đang chọn ở trang 1 (`TeacherPortalClient.tsx:90-96,170-175`, `LoansTable.tsx:165-171`). |
| **`MEDIUM-R2-03`** | **ĐÃ KHẮC PHỤC** | Đủ `!res.ok`, `catch`, banner báo lỗi & nút `Thử lại` trên cả 4 danh sách (`TeacherPortalClient`/`TeacherLoansList`, `LoansTable`, `TeacherManagerClient`, `AuditLogsClient`). |
| **`MEDIUM-R2-02` & `MEDIUM-10`** | **ĐÃ KHẮC PHỤC** | Xóa hoàn toàn `Dockerfile`, `docker-compose.yml`, `.dockerignore`, bỏ `output: 'standalone'`, chuyển sang Vercel + Turso (ADR-004). |

### 2.2. Các mục Vòng 3 (`4 MEDIUM + 4 LOW — 8/8 ĐÃ KHẮC PHỤC`)
| Mã | Mức độ | Trạng thái | Giải pháp đã áp dụng & bằng chứng |
| --- | --- | --- | --- |
| **`MEDIUM-R3-01`** | MEDIUM | **ĐÃ KHẮC PHỤC** | `src/app/api/loans/route.ts:137-141`: dùng `loanRecords.searchText` (chứa cả NFC và không dấu) cho cả `ADMIN` & `TEACHER` (đã ép `eq(loanRecords.teacherId, auth.user.id)` ở dòng `67`). Test QA `regression-round3.test.ts:548-587` đã chuyển từ FAIL sang **PASS**. |
| **`MEDIUM-R3-02`** | MEDIUM | **ĐÃ KHẮC PHỤC** | `src/lib/auth/rate-limit.ts:49-65`: chuyển `recordLoginFailure()` sang 1 câu SQL `INSERT ... ON CONFLICT DO UPDATE` nguyên tử với `CASE WHEN reset_at <= now`, loại bỏ race condition lost update trên Vercel Serverless. |
| **`MEDIUM-R3-03`** | MEDIUM | **ĐÃ KHẮC PHỤC** | `src/db/migrate.ts:87-96`: kiểm tra lại `SELECT 1 FROM _migrations WHERE name = ? LIMIT 1` ngay bên trong `client.transaction('write')` trước khi chạy DDL, chống trùng `ALTER TABLE` khi 2 Serverless instance cold-start song song. |
| **`MEDIUM-R3-04`** | MEDIUM | **ĐÃ KHẮC PHỤC** | `src/lib/env.ts:52-58` & `src/db/seed.ts:35-39`: khi `VERCEL=1`, mặc định `seedAdminMustChangePassword=true` và từ chối seed nếu thiếu `SEED_ADMIN_PASSWORD` khi chưa có Admin nào. Đã thêm test xác minh tại `src/db/db.test.ts:223-248` (**PASS**). |
| **`LOW-R3-01`** | LOW | **ĐÃ KHẮC PHỤC** | `src/lib/auth/rate-limit.ts:21-23`: chuẩn hóa khóa bucket IP thành `ip:${ip}|${username}` khớp `architecture.md:131`. |
| **`LOW-R3-02`** | LOW | **ĐÃ KHẮC PHỤC** | `docs/architecture/architecture.md:70`: đồng bộ chính xác 6 trường chỉ mục trong `loan_records.search_text`. |
| **`LOW-R3-03`** | LOW | **ĐÃ KHẮC PHỤC** | `src/db/migrate.ts:127-160` & `src/db/seed.ts:74-90`: tách bạch CLI `db:migrate` (không kích hoạt `seedDatabase`) và `db:seed`. |
| **`LOW-R3-04`** | LOW | **ĐÃ KHẮC PHỤC** | `src/app/api/loans/route.ts:71-76`: kiểm regex `/^\d+$/` chặt cho `teacherIdParam`. |

---

## 3. Ma trận nghiệm thu cuối cùng

- **Yêu cầu chức năng (`FR-01` .. `FR-12`):** **12/12 ĐẠT**.
- **Quy tắc nghiệp vụ (`BR-01` .. `BR-11`):** **11/11 ĐẠT**.
- **Phân quyền (`Permissions`):** **100% ĐẠT**.
- **Tiêu chí chấp nhận (`AC-01` .. `AC-14`):** **14/14 ĐẠT**.
- **Kiến trúc & ADR (`ADR-002`, `ADR-003`, `ADR-004`):** **100% ĐẠT** (sẵn sàng triển khai production lên **Vercel + Turso**).
