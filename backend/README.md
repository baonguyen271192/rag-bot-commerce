# zalo-rag-backend

Multi-tenant RAG API: mỗi tenant (nhà hàng) có tài liệu và lịch sử hội thoại riêng.

## Biến môi trường bắt buộc

- `OPENROUTER_API_KEY` — dùng để gọi LLM trả lời.
- `OPENAI_API_KEY` — bắt buộc nếu `EMBEDDING_PROVIDER=openai` (mặc định). Dùng để tạo embedding (`text-embedding-3-small`).
- `GEMINI_API_KEY` — bắt buộc nếu `EMBEDDING_PROVIDER=gemini`. Dùng để tạo embedding (`gemini-embedding-001`).

## Biến môi trường tuỳ chọn

- `EMBEDDING_PROVIDER` — `openai` (mặc định) hoặc `gemini`. Chọn nhà cung cấp embedding — đổi qua lại chỉ cần đổi biến này, không cần sửa code. Gemini có gói miễn phí không cần thẻ, phù hợp giai đoạn test; OpenAI cần tài khoản có nạp tiền (tối thiểu $5).
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
- `POST /tenants/:id/documents` (multipart, field `file`) → upload + index tài liệu. `.md`/`.txt`: đọc trực tiếp. `.jpg`/`.png`: trích xuất nội dung qua vision LLM trước khi index. `.pdf`: trích xuất text bằng `pdf-parse` (trả `422` nếu PDF không có text, ví dụ PDF dạng ảnh scan) (tối đa 20MB, trả `413` nếu quá lớn, `422` nếu không đọc được ảnh)
- `GET /tenants/:id/documents` → danh sách tài liệu đã upload (`{id, filename, chunkCount, createdAt}[]`)
- `DELETE /tenants/:id/documents/:docId` → xoá tài liệu khỏi LanceDB và khỏi danh sách
- `POST /tenants/:id/ask` `{conversationId, text, image?}` → `{reply}` (`image`: base64 data URI `data:image/jpeg;base64,...` hoặc `data:image/png;base64,...`, tuỳ chọn — chỉ dùng cho lượt trả lời này, không lưu vào kho tài liệu)
