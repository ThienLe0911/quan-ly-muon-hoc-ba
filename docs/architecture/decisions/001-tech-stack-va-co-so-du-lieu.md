# ADR 001: Tech stack ứng dụng và lớp truy cập cơ sở dữ liệu SQLite

- Status: Superseded by 004 <!-- chủ dự án duyệt ADR-004 ngày 2026-11-25 -->
- Date: 2026-11-24
- Người đề xuất: PM (Antigravity)

## Context

Dự án **Quản Lý Mượn Trả Học Bạ Tiểu Học** phục vụ công tác văn phòng nội bộ tại một Trường Tiểu học, cần:
- Triển khai gọn nhẹ trong một project duy nhất, chạy được trên máy tính văn phòng hoặc qua Docker mà không cần cài đặt/vận hành máy chủ CSDL ngoài (PostgreSQL/MySQL).
- Chủ dự án đã định hướng sử dụng **Next.js (TypeScript) + Tailwind CSS + SQLite**.
- Cần lựa chọn thư viện truy cập SQLite và ORM (nếu có) hỗ trợ tốt **Partial Unique Index** (`CREATE UNIQUE INDEX ... WHERE status = 'BORROWED'`) và chế độ `WAL` để đảm bảo hiệu năng cùng độ tin cậy dữ liệu.

## Options

1. **Next.js (App Router, TypeScript) + Tailwind CSS + Drizzle ORM + `better-sqlite3` (Đề xuất)**
   - *Ưu điểm:* Nhẹ, hiệu năng đồng bộ rất cao với SQLite; schema bằng TypeScript rõ ràng; hỗ trợ file migration SQL thuần nên viết được Partial Unique Index và Check Constraint dễ dàng; `better-sqlite3` hỗ trợ WAL và online backup tốt, tương thích tốt khi đóng gói Docker Node.js.
   - *Nhược điểm:* `better-sqlite3` là native module (cần build tools nếu cài trên môi trường thiếu prebuilt binary, dù Node v24 trên macOS/Linux chuẩn thường có sẵn hoặc dùng Docker Debian/Alpine).
2. **Next.js (App Router, TypeScript) + Tailwind CSS + Prisma ORM + SQLite**
   - *Ưu điểm:* Hệ sinh thái phổ biến, Prisma Studio tiện xem dữ liệu.
   - *Nhược điểm:* Nặng hơn về dung lượng image và bộ nhớ; Prisma schema không khai báo trực tiếp Partial Unique Index mà vẫn phải sửa tay file SQL migration; thêm bước `prisma generate`.
3. **Next.js (App Router, TypeScript) + Tailwind CSS + `node:sqlite` thuần (không ORM)**
   - *Ưu điểm:* Không cần cài thư viện SQLite ngoài.
   - *Nhược điểm:* `node:sqlite` trên một số phiên bản Node/Next.js bundler vẫn ở trạng thái thử nghiệm hoặc dễ gặp cảnh báo khi bundle App Router; thiếu kiểm tra kiểu dữ liệu ở tầng query và phải tự viết bộ chạy migration.

## Decision

Chọn **Phương án 1: Next.js (App Router, TypeScript) + Tailwind CSS + Drizzle ORM + `better-sqlite3`** theo phê duyệt của chủ dự án ngày `2026-11-24`. Giải pháp đảm bảo ứng dụng gọn nhẹ trong một project duy nhất, hỗ trợ SQLite WAL và Partial Unique Index trực tiếp trong migration SQL.

## Consequences

_(Cập nhật chính thức khi Decision được chọn; dự kiến theo Phương án 1 nếu được duyệt)_:
- Cần chủ dự án duyệt cài đặt các gói phụ thuộc tối thiểu (dự kiến: `next`, `react`, `react-dom`, `tailwindcss`, `drizzle-orm`, `better-sqlite3`, `zod`, cùng các gói dev/test tương ứng) khi bước vào giai đoạn triển khai.
- Thiết lập thư mục migration SQL tại `drizzle/` (hoặc `src/db/migrations/`) để quản lý schema có kiểm soát phiên bản.
- Chuẩn hóa cấu hình `next.config` (như `serverExternalPackages: ['better-sqlite3']`) và volume `./data` cho file SQLite khi chạy Docker hoặc local.
