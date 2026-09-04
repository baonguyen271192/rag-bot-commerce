# zalo-bridge

Tự động trả lời tin nhắn 1-1 gửi tới tài khoản Zalo cá nhân của nhà hàng, dùng backend RAG-Enterprise.

**Yêu cầu:** Node.js >= 22

## Biến môi trường bắt buộc

- `BACKEND_BASE_URL` — ví dụ `http://localhost:8000` (hoặc `http://backend:8000` khi chạy trong docker-compose cùng mạng với backend).
- `ZALO_BRIDGE_SERVICE_API_KEY` — phải khớp với giá trị cấu hình ở backend (`auth.zalo_bridge_service_api_key`).
- `AGENT_NAME` — tên 1 agent đã tồn tại trong `agent_conf_repo` của backend (ví dụ `QMSAssistant` trong môi trường dev). Chuỗi rỗng KHÔNG dùng được — backend sẽ trả lỗi 400.

## Biến môi trường tuỳ chọn

- `SQLITE_PATH` — mặc định `zalo-bridge/data/mappings.db`.
- `ZALO_CREDENTIALS_PATH` — mặc định `zalo-bridge/data/credentials.json`.

## Chạy lần đầu

```bash
npm install
BACKEND_BASE_URL=http://localhost:8000 \
ZALO_BRIDGE_SERVICE_API_KEY=<secret> \
AGENT_NAME=QMSAssistant \
node index.js
```

Lần đầu chạy sẽ in ra đường dẫn file QR (`qr.png`) — mở file này và quét bằng **đúng tài khoản Zalo cá nhân của nhà hàng**. Sau khi đăng nhập thành công, phiên đăng nhập được lưu vào `data/credentials.json` — các lần chạy sau sẽ không cần quét lại QR trừ khi phiên bị Zalo thu hồi.

**Không commit thư mục `data/` vào git** — nó chứa phiên đăng nhập thật.
