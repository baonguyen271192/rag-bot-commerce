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
- `DOCUMENTS_DIR` — mặc định `backend/data/documents`. Nơi lưu file gốc (ảnh) và ảnh từng trang PDF, dùng để bot gửi lại ảnh thật khi trả lời (xem route `/image` bên dưới).
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
- `POST /tenants/:id/documents` (multipart, field `file`) → upload + index tài liệu. `.md`/`.txt`: đọc trực tiếp, không lưu ảnh. `.jpg`/`.png`: trích xuất nội dung qua vision LLM trước khi index, lưu lại ảnh gốc. `.pdf`: dùng `pdf-parse` để (1) trích xuất text từng trang riêng và (2) render từng trang thành ảnh PNG — mỗi đoạn (chunk) được gắn số trang tương ứng, nên khi trả lời bot biết chính xác nên gửi kèm ảnh trang nào (trả `422` nếu PDF không có text, ví dụ PDF dạng ảnh scan) (tối đa 20MB, trả `413` nếu quá lớn, `422` nếu không đọc được ảnh)
- `GET /tenants/:id/documents` → danh sách tài liệu đã upload (`{id, filename, chunkCount, mimetype, createdAt}[]`)
- `DELETE /tenants/:id/documents/:docId` → xoá tài liệu khỏi LanceDB, khỏi danh sách, và xoá ảnh gốc/ảnh trang đã lưu trên đĩa
- `GET /tenants/:id/documents/:docId/image?page=N` → trả về ảnh gốc (tài liệu dạng ảnh) hoặc ảnh trang N đã render (tài liệu PDF, bắt buộc phải có `page`). `404` nếu tài liệu là `.md`/`.txt` (không có ảnh) hoặc không tồn tại.
- `POST /tenants/:id/ask` `{conversationId, text, image?}` → `{reply, attachment}` (`image`: base64 data URI `data:image/jpeg;base64,...` hoặc `data:image/png;base64,...`, tuỳ chọn — chỉ dùng cho lượt trả lời này, không lưu vào kho tài liệu). `attachment` là `null`, hoặc `{docId, page, mimetype}` khi đoạn tài liệu khớp nhất với câu hỏi có ảnh gốc — dùng để gọi route `/image` ở trên và gửi kèm ảnh thật cho khách.
