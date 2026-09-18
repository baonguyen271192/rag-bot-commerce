# Commerce — Bot đặt đơn đa cửa hàng, đa ngành

Tách ra từ dự án BQ (Giai đoạn 1 của thiết kế đa kênh — xem
`../docs` hoặc `BQ/docs/omnichannel-bot-design.md`). Đây là **bộ não đặt đơn**
(giỏ hàng → thu thông tin giao → chốt đơn) dùng chung cho nhiều cửa hàng
(tenant), mỗi cửa hàng có Fanpage/catalog/tone riêng, cách ly hoàn toàn.

Hiện phục vụ kênh **Facebook** qua webhook; kênh khác (Zalo…) chỉ cần gọi
`engine.handle(sender_id, text, store_id)` rồi tự map định dạng gửi của kênh đó
— xem thiết kế gateway/brain-router trong tài liệu đa kênh.

## Chạy thử

```bash
cd commerce
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # rồi điền GROQ_API_KEY để bật tư vấn AI (không bắt buộc)
uvicorn app.main:app --host 127.0.0.1 --port 8200
```

Mở trình giả lập: `http://127.0.0.1:8200/fb?store=<id>` (qua proxy) hoặc thẳng
`http://127.0.0.1:8200/` — có 3 cửa hàng demo dựng sẵn:

| store_id | Tên | Ngành |
|---|---|---|
| `default` | Giày BQ (demo) | shoe — có size |
| `shop2` | Giày Nam Phong Cách | shoe — có size |
| `chao` | Cháo Nghêu O Hoèn | food — theo phần |

## Cấu trúc

```
commerce/
  app/
    main.py       # FastAPI: webhook FB, simulator, console quản lý bot
    engine.py     # bộ não hội thoại (giỏ hàng, checkout, tra đơn)
    assistant.py  # trợ lý tư vấn (Groq/Gemini + luật local)
    messenger.py  # Facebook Send API
    stores.py     # registry đa cửa hàng (tenant) + CRUD qua API
    store.py      # SQLite lưu đơn, lọc theo store_id
    catalog.py    # dữ liệu demo (258 sản phẩm giày)
    data.py       # helper định dạng tiền + export catalog
  static/simulator.html
```

## Console quản lý bot

- `GET /api/admin/stores` — danh sách bot + trạng thái kết nối Fanpage
- `POST /api/admin/stores` — tạo cửa hàng mới (chạy ngay, không cần deploy lại)
- `PUT /api/admin/stores/{id}` — sửa tên/Fanpage/tone
- `POST/DELETE /api/admin/stores/{id}/menu` — quản menu/sản phẩm
- `GET /api/orders?store_id=...` — xem đơn của 1 cửa hàng

Cửa hàng người dùng tạo được lưu vào `app/stores_config.json` (bỏ qua trong
git) để không mất khi restart. 3 cửa hàng demo ở trên là "dựng sẵn", không xoá/
sửa menu được qua API (chỉ đổi Fanpage/tên).
