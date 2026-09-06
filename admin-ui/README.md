# zalo-rag-admin-ui

Giao diện quản trị: tạo tenant (nhà hàng), upload/quản lý tài liệu, sửa system prompt, xem trạng thái đăng nhập Zalo + mã QR.

## Biến môi trường tuỳ chọn

- `VITE_BACKEND_URL` — mặc định `http://localhost:4001`.
- `VITE_BRIDGE_URL` — mặc định `http://localhost:4002`.

## Chạy

```bash
npm install
npm run dev
```

Cần `backend/` và `bridge/` đang chạy song song (xem README của từng thư mục đó).

## Giới hạn đã biết

- Không có đăng nhập/phân quyền (bản đầu, đúng scope MVP đã duyệt).
- Nếu vừa tạo tenant mới, trạng thái Zalo sẽ hiện "Chưa kết nối" cho tới khi `bridge/` được khởi động lại (giới hạn MVP đã biết — bridge chỉ phát hiện tenant mới lúc khởi động).
