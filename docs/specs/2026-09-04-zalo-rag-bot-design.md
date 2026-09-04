# Zalo RAG Bot (multi-tenant) — Design

**Date:** 2026-09-04
**Status:** Approved (pending implementation plan)

**Cập nhật 2026-09-04:** thêm khả năng xử lý ảnh (vision) — xem mục "Xử lý ảnh (Vision)". `backend/` (Plan 1) đã implement xong **trước** khi mục này được thêm vào — cần 1 plan bổ sung riêng cho backend (thêm nhánh ảnh vào `llm.js`/`documents.js`/`ask.js`) trước khi hoặc song song với việc viết plan cho `bridge/`/`admin-ui/`.

## Purpose

Một sản phẩm độc lập, thương mại hoá được: cho phép nhiều nhà hàng (mỗi nhà hàng = 1 tenant) tự động trả lời khách hàng qua tài khoản Zalo cá nhân, dựa trên tài liệu (menu, thông tin) riêng của từng nhà hàng, quản lý qua 1 web admin đơn giản. Tenant đầu tiên: **Trúc Lâm Viên** (Đà Nẵng).

## Bối cảnh & lý do tách dự án riêng

Ý tưởng ban đầu được thử nghiệm bằng cách tái sử dụng backend RAG-Enterprise (một hệ thống nội bộ khác, không thuộc sở hữu của người dùng). Quá trình thử nghiệm đó (ghi lại trong một phiên làm việc riêng) đã xác nhận: kiến trúc "Node.js bridge (`zca-js`) ↔ backend RAG ↔ Zalo" hoạt động đúng end-to-end. Tuy nhiên:

- Backend đó **không thuộc sở hữu của người dùng** — không được phép dùng làm nền tảng cho sản phẩm thương mại bán cho bên thứ ba.
- Backend đó cõng theo rất nhiều tính năng doanh nghiệp không liên quan (SSO/Keycloak, voice/STT/TTS, audit log, governance, multi-service enterprise stack: Postgres + Redis + LiteLLM + Ollama + FileAPI microservice) — nặng nề không cần thiết cho 1 con bot Zalo trả lời khách nhà hàng.

Dự án này viết lại **từ đầu, sạch (clean-room)** — chỉ mang theo kiến thức/pattern kỹ thuật đã học (cách `zca-js` hoạt động thật, cách parse SSE, cách xử lý mention nhóm...), không copy bất kỳ file code nào, và dữ liệu Trúc Lâm Viên (tự cào từ website công khai `truclamvien.vn`, không liên quan gì tới hệ thống nội bộ nói trên).

## Kiến trúc tổng thể

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  admin-ui   │─────▶│      backend      │◀────▶│      bridge      │
│ (React/Vite)│ HTTP │  (Node/Express)   │ HTTP │ (Node, 1 process, │
└─────────────┘      │                    │      │  N tenant session)│
                      │ - tenants (SQLite) │      └─────────┬─────────┘
                      │ - vectors (LanceDB)│                │ zca-js
                      │ - embeddings(OpenAI)│                ▼
                      │ - LLM (OpenRouter) │            Zalo (N tài khoản,
                      └────────────────────┘             1 mỗi nhà hàng)
```

**3 thành phần độc lập, giao tiếp qua HTTP nội bộ:**

1. **`backend/`** (Node.js, Express) — nguồn sự thật cho tenant config, tài liệu, và trả lời RAG. Không biết gì về Zalo.
2. **`bridge/`** (Node.js, 1 process) — sở hữu N session `zca-js` (1 mỗi tenant), gọi `backend` để lấy câu trả lời. Không tự lưu tài liệu/tenant config — hỏi `backend` mỗi khi cần.
3. **`admin-ui/`** (React/Vite, dùng skill `ui-ux-pro-max`) — giao diện web để tạo tenant, upload tài liệu, sửa persona, xem trạng thái đăng nhập Zalo (QR).

Không có Postgres, không SSO, không FileAPI microservice riêng, không LiteLLM proxy — `backend` gọi thẳng OpenAI (embedding) và OpenRouter (LLM) qua HTTP.

## Thành phần chi tiết

### `backend/` (Node.js + Express)

| File | Trách nhiệm |
|---|---|
| `src/db.js` | SQLite (`better-sqlite3`): bảng `tenants(id, name, system_prompt, created_at)` |
| `src/vectorstore.js` | LanceDB: 1 table riêng mỗi tenant (`vectors/<tenant-id>`), lưu chunk + embedding, hỗ trợ similarity search |
| `src/embeddings.js` | Gọi OpenAI `text-embedding-3-small` để biến text thành vector |
| `src/llm.js` | Gọi OpenRouter (model mặc định, có thể theo tenant sau này) để sinh câu trả lời từ context + câu hỏi. Model mặc định phải hỗ trợ vision (đọc ảnh) — xem "Xử lý ảnh". `complete()` chấp nhận thêm ảnh tuỳ chọn, gửi kèm theo định dạng vision chuẩn OpenAI (`image_url`) |
| `src/chunker.js` | Chia nhỏ tài liệu markdown/text thành đoạn (chunk) trước khi embed — theo heading hoặc theo độ dài cố định |
| `src/rag.js` | Orchestration: nhận câu hỏi (+ ảnh tuỳ chọn) → embed câu hỏi text → tìm chunk liên quan trong LanceDB của đúng tenant → build prompt (system_prompt của tenant + context + câu hỏi) → gọi `llm.js` (kèm ảnh nếu có) → trả lời |
| `src/routes/tenants.js` | `POST /tenants`, `GET /tenants`, `GET /tenants/:id`, `PUT /tenants/:id` (sửa `system_prompt`) |
| `src/routes/documents.js` | `POST /tenants/:id/documents` — upload text/markdown: chunk + embed + lưu như cũ; upload ảnh (jpg/png): gọi vision LLM trích xuất nội dung thành text, rồi đưa qua **cùng pipeline** chunk + embed + lưu. `GET /tenants/:id/documents` (liệt kê), `DELETE /tenants/:id/documents/:docId` |
| `src/routes/ask.js` | `POST /tenants/:id/ask` — nhận `{conversationId, text, image?}` (`image` là base64 data URI, tuỳ chọn), trả `{reply}` — dùng bởi `bridge`. Ảnh chỉ dùng cho lượt trả lời này, **không** lưu vào LanceDB |
| `src/routes/threads.js` | Lưu/lấy lịch sử hội thoại ngắn (SQLite bảng `messages(tenant_id, conversation_id, role, text, created_at)`) — dùng vài lượt gần nhất làm ngữ cảnh cho LLM |

**Không có khái niệm "agent config phức tạp"** như RAG-Enterprise — mỗi tenant chỉ có 1 `system_prompt` (text đơn giản, sửa được qua admin-ui) và 1 tập tài liệu riêng.

### `bridge/` (Node.js, 1 process)

| File | Trách nhiệm |
|---|---|
| `src/tenant-session.js` | Quản lý 1 session Zalo: login (QR lần đầu, cookie sau đó), lắng nghe tin nhắn, lọc DM + mention nhóm (tái dùng logic đã kiểm chứng: `shouldHandleMessage`), phát hiện ảnh đính kèm và tải về (xem "Xử lý ảnh"), gọi `backend` `/tenants/:id/ask` (kèm ảnh base64 nếu có), gửi trả lời qua `zca-js` |
| `src/manager.js` | Lúc khởi động: gọi `GET {BACKEND_URL}/tenants` lấy danh sách tenant, với mỗi tenant tạo 1 `tenant-session` độc lập (mỗi session có `data/<tenant-id>/credentials.json` riêng) |
| `src/index.js` | Entrypoint — khởi động `manager.js`, log trạng thái từng tenant |

**Cô lập lỗi giữa các tenant:** mỗi `tenant-session` chạy trong try/catch riêng (không dùng `Promise.all` không bọc lỗi) — 1 tenant lỗi (session hết hạn, backend timeout...) không được làm crash tiến trình hoặc dừng các tenant khác. Đây là điểm khác biệt quan trọng so với bản thử nghiệm trước (chỉ có 1 tenant nên chưa cần cô lập).

### `admin-ui/` (React + Vite, dùng skill `ui-ux-pro-max`)

Trang quản trị đơn giản:
- Danh sách tenant (tên, trạng thái đăng nhập Zalo: đã login / chờ quét QR / lỗi)
- Tạo tenant mới (tên + system prompt ban đầu)
- Trang chi tiết 1 tenant: upload tài liệu (kéo-thả file `.md`/`.txt`/`.jpg`/`.png`), xem danh sách tài liệu đã có, sửa system prompt, xem mã QR nếu chưa đăng nhập Zalo (bridge expose `GET /tenants/:id/qr-status` trả về đường dẫn ảnh QR hiện tại nếu có). Upload ảnh thành công → hiển thị nội dung text đã trích xuất để admin kiểm tra (không sửa trực tiếp trong UI — sai thì xoá và upload lại)

Không cần đăng nhập/phân quyền ở bản đầu (chạy local/nội bộ cho 1 người vận hành) — có thể thêm sau nếu cần nhiều người quản lý.

## Xử lý ảnh (Vision)

**Cách đọc ảnh:** dùng LLM có khả năng nhìn ảnh (vision) qua OpenRouter — không thêm OCR/dịch vụ riêng, tái dùng `llm.js` đã có. Model mặc định phải đổi sang 1 model hỗ trợ vision ([Unverified] — cần xác minh model cụ thể còn free/hoạt động tại thời điểm implement, giống cách đã verify `minimax-m3:free` trước đây).

**2 trường hợp dùng ảnh, xử lý khác nhau:**

1. **Admin upload ảnh (vd chụp menu giấy) → tài liệu vĩnh viễn.** `POST /tenants/:id/documents` nhận file ảnh → gọi vision LLM trích xuất nội dung thành text → đưa qua **đúng pipeline cũ** (chunker → embed → LanceDB). Admin xem lại text trích xuất trên admin-ui; sai thì xoá tài liệu, upload lại ảnh rõ hơn.
2. **Khách gửi ảnh trong chat Zalo → chỉ dùng cho lượt trả lời đó.** `bridge` phát hiện đính kèm ảnh trong tin nhắn ([Unverified] — cần xác minh cấu trúc message của `zca-js` khi implement) → tự tải ảnh về (HTTP GET bằng session đã đăng nhập, **không** phụ thuộc việc URL Zalo có public hay không) → encode base64 → gửi kèm `POST /tenants/:id/ask { conversationId, text, image }`. `rag.js` vẫn tìm chunk liên quan theo câu hỏi text như bình thường, đính ảnh vào lượt gọi LLM đó — **không** lưu ảnh, **không** thêm vào LanceDB.

**Giới hạn:**
- Dung lượng ảnh tối đa 5MB (đề xuất, có thể chỉnh) — vượt quá thì bỏ qua ảnh, xử lý như tin nhắn text thường.
- Chỉ hỗ trợ ảnh tĩnh (jpg/png). Video, sticker, file khác — bỏ qua đính kèm, không hỗ trợ.
- Mỗi lần upload tài liệu / mỗi tin nhắn chat: tối đa 1 ảnh (khớp giả định 1-file-mỗi-request đã có).

**Lỗi:**
- Upload ảnh mà vision LLM đọc lỗi (mờ, timeout, định dạng lạ) → trả lỗi rõ ràng cho admin-ui, không lưu tài liệu rỗng.
- Ảnh khách gửi trong chat xử lý lỗi (tải lỗi, vision LLM lỗi, quá dung lượng) → fallback về xử lý text-only hoặc tin nhắn lỗi mặc định, không lộ lỗi kỹ thuật, không crash session (đúng cơ chế cô lập lỗi ở trên).

## Data flow — 1 lượt hỏi-đáp

```
Khách nhắn Zalo (DM hoặc tag @ trong nhóm), có thể kèm 1 ảnh
  → tenant-session.js (đúng session của nhà hàng đó) nhận, lọc điều kiện,
    nếu có ảnh thì tải về + encode base64 (xem "Xử lý ảnh")
  → POST {BACKEND_URL}/tenants/{id}/ask  { conversationId, text, image? }
  → backend: embed câu hỏi text (OpenAI) → tìm chunk liên quan trong LanceDB
    của tenant đó → lấy vài lượt hội thoại gần nhất (SQLite) → build prompt
    → gọi OpenRouter (kèm ảnh nếu có) → lưu message vào SQLite → trả { reply }
  → tenant-session.js gửi `reply` lại đúng khách/nhóm qua zca-js
```

## Data flow — thiết lập tenant mới qua admin-ui

```
Admin tạo tenant "Trúc Lâm Viên" (tên + system prompt) qua admin-ui
  → POST /tenants → backend lưu vào SQLite, tạo LanceDB table rỗng
  → Admin upload thong-tin-nha-hang.md, thuc-don.md qua admin-ui
  → POST /tenants/{id}/documents → backend chunk + embed + lưu vào LanceDB
  → bridge (đang chạy) phát hiện tenant mới (poll định kỳ hoặc restart thủ công
    ở bản đầu) → tạo session Zalo mới cho tenant đó → in QR ra admin-ui
  → Admin đưa QR cho chủ nhà hàng quét bằng tài khoản Zalo của họ
  → Session lưu credentials, bot bắt đầu hoạt động cho tenant đó
```

## Error handling

- Mỗi tenant-session: lỗi gọi backend (timeout, 5xx) → gửi tin nhắn fallback cố định, log lỗi kèm tenant id, **không** làm crash session khác.
- `backend`/`ask.js`: lỗi gọi OpenAI/OpenRouter → trả lỗi rõ ràng cho bridge (không phải 200 với nội dung rác) để bridge biết fallback.
- Session Zalo hết hạn (bị đăng xuất từ phiên Web khác — giới hạn đã biết của Zalo) → tenant-session log rõ, cần quét QR lại qua admin-ui — không tự động được (giới hạn vốn có của nền tảng, đã xác nhận trong thử nghiệm trước).
- 1 tenant chưa đăng nhập Zalo (QR chưa quét) không được chặn các tenant khác khởi động.

## Testing

- `backend`: unit test cho `chunker.js`, `rag.js` (mock embedding/LLM calls), route tests cho `documents.js`/`ask.js` (dùng `supertest` hoặc tương đương). Thêm: unit test nhánh ảnh trong `llm.js` (mock fetch, kiểm tra đúng định dạng `image_url`) và trong `documents.js` (mock vision LLM, kiểm tra text trích xuất được đưa đúng qua chunker).
- `bridge`: unit test cho `shouldHandleMessage`/logic lọc (tái dùng bộ test đã viết trong thử nghiệm trước, viết lại sạch). Thêm: unit test logic phát hiện/giới hạn dung lượng/fallback ảnh bằng message giả lập. Không test được live Zalo login hay tải ảnh thật (giới hạn đã biết) — verify thủ công bằng tài khoản thật khi triển khai tenant đầu tiên (Trúc Lâm Viên).
- `admin-ui`: test thủ công qua trình duyệt (tạo tenant, upload tài liệu, xem QR) — không cần test tự động ở bản đầu.

## Out of scope (bản đầu — YAGNI)

- Thanh toán/billing cho khách hàng (nhà hàng trả tiền dùng dịch vụ) — làm sau khi có tenant thật dùng ổn định.
- Đăng nhập/phân quyền nhiều người quản trị trên admin-ui.
- Tự động phát hiện tenant mới mà không cần restart `bridge` (bản đầu: thêm tenant xong, restart `bridge` thủ công).
- Model LLM/embedding khác nhau theo từng tenant (bản đầu: dùng chung 1 model cho tất cả).
- Rate limiting / chống spam nâng cao (đã biết bug 409 "thread đang chạy" khi 1 khách nhắn liên tiếp quá nhanh — chấp nhận fallback message, không giải quyết ngay).
- Video/sticker/file đính kèm khác ngoài ảnh tĩnh (jpg/png) — không hỗ trợ.
- Sửa nội dung ảnh đã trích xuất trực tiếp trong admin-ui — sai thì xoá và upload lại.
- Nhiều ảnh trong 1 lần upload tài liệu hoặc 1 tin nhắn chat — v1 chỉ 1 ảnh/lần.
- Tự động lưu ảnh khách gửi trong chat vào kho tài liệu chung — chủ động không làm (rủi ro nội dung không kiểm duyệt lẫn vào câu trả lời cho khách khác).
