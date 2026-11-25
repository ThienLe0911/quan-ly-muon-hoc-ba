# Mục lục quyết định kiến trúc (ADR)

Mỗi ADR nằm tại `docs/architecture/decisions/NNN-*.md`. Chỉ chủ dự án được đổi trạng thái thành `Accepted`.

| Số | Tiêu đề | Trạng thái |
| --- | --- | --- |
| 001 | [Tech stack ứng dụng và lớp truy cập cơ sở dữ liệu SQLite](001-tech-stack-va-co-so-du-lieu.md) | Superseded by 004 |
| 002 | [Cơ chế xác thực phiên và phân quyền Admin / Giáo viên](002-co-che-xac-thuc-va-phan-quyen.md) | Accepted |
| 003 | [Định danh học bạ tự nhập, chống mượn trùng và quy tắc tính quá hạn](003-dinh-danh-hoc-ba-va-quy-tac-qua-han.md) | Accepted |
| 004 | [Triển khai trên Vercel và chuyển cơ sở dữ liệu sang Turso (libSQL)](004-trien-khai-vercel-va-co-so-du-lieu-turso.md) | Accepted |

Ghi chú: Các quyết định chỉ ảnh hưởng một feature được ghi trong `spec.md` của feature đó; các quyết định nền tảng ảnh hưởng kiến trúc, dữ liệu hoặc công nghệ được ghi thành ADR tại thư mục này.
