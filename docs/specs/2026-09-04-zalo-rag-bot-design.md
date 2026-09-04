# Zalo RAG Bot (multi-tenant) — Design

**Date:** 2026-09-04
**Status:** Approved (pending implementation plan)

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
| `src/llm.js` | Gọi OpenRouter (model mặc định, có thể theo tenant sau này) để sinh câu trả lời từ context + câu hỏi |
| `src/chunker.js` | Chia nhỏ tài liệu markdown/text thành đoạn (chunk) trước khi embed — theo heading hoặc theo độ dài cố định |
| `src/rag.js` | Orchestration: nhận câu hỏi → embed → tìm chunk liên quan trong LanceDB của đúng tenant → build prompt (system_prompt của tenant + context + câu hỏi) → gọi `llm.js` → trả lời |
| `src/routes/tenants.js` | `POST /tenants`, `GET /tenants`, `GET /tenants/:id`, `PUT /tenants/:id` (sửa `system_prompt`) |
| `src/routes/documents.js` | `POST /tenants/:id/documents` (upload text/markdown, chunk + embed + lưu), `GET /tenants/:id/documents` (liệt kê), `DELETE /tenants/:id/documents/:docId` |
| `src/routes/ask.js` | `POST /tenants/:id/ask` — nhận `{conversationId, text}`, trả `{reply}` — dùng bởi `bridge` |
| `src/routes/threads.js` | Lưu/lấy lịch sử hội thoại ngắn (SQLite bảng `messages(tenant_id, conversation_id, role, text, created_at)`) — dùng vài lượt gần nhất làm ngữ cảnh cho LLM |

**Không có khái niệm "agent config phức tạp"** như RAG-Enterprise — mỗi tenant chỉ có 1 `system_prompt` (text đơn giản, sửa được qua admin-ui) và 1 tập tài liệu riêng.

### `bridge/` (Node.js, 1 process)

| File | Trách nhiệm |
|---|---|
| `src/tenant-session.js` | Quản lý 1 session Zalo: login (QR lần đầu, cookie sau đó), lắng nghe tin nhắn, lọc DM + mention nhóm (tái dùng logic đã kiểm chứng: `shouldHandleMessage`), gọi `backend` `/tenants/:id/ask`, gửi trả lời qua `zca-js` |
| `src/manager.js` | Lúc khởi động: gọi `GET {BACKEND_URL}/tenants` lấy danh sách tenant, với mỗi tenant tạo 1 `tenant-session` độc lập (mỗi session có `data/<tenant-id>/credentials.json` riêng) |
| `src/index.js` | Entrypoint — khởi động `manager.js`, log trạng thái từng tenant |

**Cô lập lỗi giữa các tenant:** mỗi `tenant-session` chạy trong try/catch riêng (không dùng `Promise.all` không bọc lỗi) — 1 tenant lỗi (session hết hạn, backend timeout...) không được làm crash tiến trình hoặc dừng các tenant khác. Đây là điểm khác biệt quan trọng so với bản thử nghiệm trước (chỉ có 1 tenant nên chưa cần cô lập).

### `admin-ui/` (React + Vite, dùng skill `ui-ux-pro-max`)

Trang quản trị đơn giản:
- Danh sách tenant (tên, trạng thái đăng nhập Zalo: đã login / chờ quét QR / lỗi)
- Tạo tenant mới (tên + system prompt ban đầu)
- Trang chi tiết 1 tenant: upload tài liệu (kéo-thả file `.md`/`.txt`), xem danh sách tài liệu đã có, sửa system prompt, xem mã QR nếu chưa đăng nhập Zalo (bridge expose `GET /tenants/:id/qr-status` trả về đường dẫn ảnh QR hiện tại nếu có)

Không cần đăng nhập/phân quyền ở bản đầu (chạy local/nội bộ cho 1 người vận hành) — có thể thêm sau nếu cần nhiều người quản lý.

## Data flow — 1 lượt hỏi-đáp

```
Khách nhắn Zalo (DM hoặc tag @ trong nhóm)
  → tenant-session.js (đúng session của nhà hàng đó) nhận, lọc điều kiện
  → POST {BACKEND_URL}/tenants/{id}/ask  { conversationId, text }
  → backend: embed câu hỏi (OpenAI) → tìm chunk liên quan trong LanceDB
    của tenant đó → lấy vài lượt hội thoại gần nhất (SQLite) → build prompt
    → gọi OpenRouter → lưu message vào SQLite → trả { reply }
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

- `backend`: unit test cho `chunker.js`, `rag.js` (mock embedding/LLM calls), route tests cho `documents.js`/`ask.js` (dùng `supertest` hoặc tương đương).
- `bridge`: unit test cho `shouldHandleMessage`/logic lọc (tái dùng bộ test đã viết trong thử nghiệm trước, viết lại sạch). Không test được live Zalo login (giới hạn đã biết) — verify thủ công bằng tài khoản thật khi triển khai tenant đầu tiên (Trúc Lâm Viên).
- `admin-ui`: test thủ công qua trình duyệt (tạo tenant, upload tài liệu, xem QR) — không cần test tự động ở bản đầu.

## Out of scope (bản đầu — YAGNI)

- Thanh toán/billing cho khách hàng (nhà hàng trả tiền dùng dịch vụ) — làm sau khi có tenant thật dùng ổn định.
- Đăng nhập/phân quyền nhiều người quản trị trên admin-ui.
- Tự động phát hiện tenant mới mà không cần restart `bridge` (bản đầu: thêm tenant xong, restart `bridge` thủ công).
- Model LLM/embedding khác nhau theo từng tenant (bản đầu: dùng chung 1 model cho tất cả).
- Rate limiting / chống spam nâng cao (đã biết bug 409 "thread đang chạy" khi 1 khách nhắn liên tiếp quá nhanh — chấp nhận fallback message, không giải quyết ngay).
