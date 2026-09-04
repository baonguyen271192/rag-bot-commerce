# zalo-rag-backend

Multi-tenant RAG API: mỗi tenant (nhà hàng) có tài liệu và lịch sử hội thoại riêng.

## Biến môi trường bắt buộc

- `OPENAI_API_KEY` — dùng để tạo embedding (`text-embedding-3-small`).
- `OPENROUTER_API_KEY` — dùng để gọi LLM trả lời.

## Biến môi trường tuỳ chọn

- `PORT` — mặc định `4001`.
- `SQLITE_PATH` — mặc định `backend/data/tenants.db`.
- `LANCE_PATH` — mặc định `backend/data/vectors`.
- `LLM_MODEL` — mặc định `minimax/minimax-m3:free` (model free trên OpenRouter, đã verify hoạt động và hỗ trợ input ảnh — `input_modalities: text+image+video`, xác minh qua OpenRouter models API ngày 2026-09-04).

## Chạy

```bash
npm install
OPENAI_API_KEY=... OPENROUTER_API_KEY=... node index.js
```

## API

- `POST /tenants` `{id, name, systemPrompt}` → tạo tenant
- `GET /tenants` → danh sách tenant
- `GET /tenants/:id` → chi tiết 1 tenant
- `PUT /tenants/:id` `{systemPrompt}` → sửa persona
- `POST /tenants/:id/documents` (multipart, field `file`) → upload + index tài liệu. `.md`/`.txt`: đọc trực tiếp. `.jpg`/`.png`: trích xuất nội dung qua vision LLM trước khi index (tối đa 5MB, trả `422` nếu không đọc được ảnh)
- `POST /tenants/:id/ask` `{conversationId, text, image?}` → `{reply}` (`image`: base64 data URI `data:image/jpeg;base64,...` hoặc `data:image/png;base64,...`, tuỳ chọn — chỉ dùng cho lượt trả lời này, không lưu vào kho tài liệu)
