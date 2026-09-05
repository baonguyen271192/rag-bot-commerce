# zalo-rag-bridge

Kết nối N tài khoản Zalo (1 mỗi tenant/nhà hàng) tới `backend/` — nghe tin nhắn DM và tag `@` trong nhóm, gọi `backend` để lấy câu trả lời RAG, gửi lại qua Zalo.

## Biến môi trường bắt buộc

- `BACKEND_URL` — địa chỉ `backend/` (vd `http://localhost:4001`).

## Biến môi trường tuỳ chọn

- `DATA_DIR` — nơi lưu credentials/QR mỗi tenant, mặc định `bridge/data`.
- `STATUS_PORT` — cổng cho HTTP API trạng thái, mặc định `4002`.

## Chạy

```bash
npm install
BACKEND_URL=http://localhost:4001 node index.js
```

Lần đầu chạy với mỗi tenant: chưa có credentials → in QR ra `data/<tenant-id>/qr.png`, chủ nhà hàng quét bằng tài khoản Zalo của họ. Các lần sau tự đăng nhập lại bằng credentials đã lưu.

## HTTP API (dùng bởi `admin-ui/`)

- `GET /sessions` → `[{tenantId, status, ...}]` — trạng thái tất cả tenant đang quản lý.
- `GET /tenants/:id/qr-status` → `{status}` hoặc `{status: 'awaiting_qr', qrUrl}`.
- `GET /tenants/:id/qr.png` → ảnh QR hiện tại (nếu có).

## Giới hạn đã biết

- Chỉ phát hiện tenant mới bằng cách gọi `GET {BACKEND_URL}/tenants` lúc khởi động — thêm tenant mới trên `backend/` cần restart `bridge/` thủ công (đúng scope MVP đã duyệt trong spec).
- Phiên Zalo bị đăng xuất từ nơi khác (giới hạn nền tảng, đã biết) → cần quét QR lại, không tự động được.
