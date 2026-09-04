# zalo-rag-backend

Multi-tenant RAG API: mỗi tenant (nhà hàng) có tài liệu và lịch sử hội thoại riêng.

## Biến môi trường bắt buộc

- `OPENAI_API_KEY` — dùng để tạo embedding (`text-embedding-3-small`).
- `OPENROUTER_API_KEY` — dùng để gọi LLM trả lời.

## Biến môi trường tuỳ chọn

- `PORT` — mặc định `4001`.
- `SQLITE_PATH` — mặc định `backend/data/tenants.db`.
- `LANCE_PATH` — mặc định `backend/data/vectors`.
- `LLM_MODEL` — mặc định `minimax/minimax-m3:free` (model free trên OpenRouter, đã verify hoạt động).

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
- `POST /tenants/:id/documents` (multipart, field `file`) → upload + index tài liệu
- `POST /tenants/:id/ask` `{conversationId, text}` → `{reply}`
