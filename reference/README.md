# Reference material (không phải code cuối cùng)

Thư mục này chứa tài liệu tham khảo, **không phải** code sẽ ship trong sản phẩm — dùng để đối chiếu khi viết lại theo `docs/specs/2026-09-04-zalo-rag-bot-design.md`.

## `zalo-bridge-prototype/`

Prototype single-tenant, viết mới hoàn toàn trong một phiên làm việc thử nghiệm riêng (không copy từ bất kỳ codebase doanh nghiệp nào — chỉ dùng `zca-js` là thư viện public). Đã verify chạy thật với 1 tài khoản Zalo, xử lý được:
- Đăng nhập QR + lưu session (`src/zalo-session.js`)
- Lọc tin nhắn 1-1 và tag `@` trong nhóm (`src/message-handler.js`)
- Parse SSE (đã fix bug CRLF line-ending — xem `src/backend-client.js`)
- Map Zalo user → thread bằng SQLite (`src/store.js`)

**Cần viết lại** theo spec mới: hỗ trợ N tenant (1 process, nhiều session), gọi backend HTTP mới (không phải `/api/v1/threads/{id}/run-sync` của hệ SSE cũ) mà là `/tenants/{id}/ask` đơn giản hơn (JSON, không SSE).

## `truc-lam-vien-data/`

Menu + thông tin nhà hàng Trúc Lâm Viên, tự cào từ website công khai `truclamvien.vn` (robots.txt cho phép). Dữ liệu thật, dùng trực tiếp làm tài liệu cho tenant đầu tiên.
