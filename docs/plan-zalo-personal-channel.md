# Kế hoạch: kênh Zalo cá nhân cho `commerce/`

> Nguồn: kết quả subagent Plan (lập kế hoạch dựa trên brainstorm kiến trúc đã chốt trong hội thoại), chép nguyên văn để đối chiếu khi triển khai.

## Findings before the plan (read the actual code, not just the brief)

**No existing Zalo code in `commerce/`.** I grepped the whole tree (excluding `node_modules`) for "zalo" case-insensitive — only docstring/README mentions of "Zalo" as a future channel exist (`commerce/README.md:8`, `app/engine.py:11`, `app/main.py:3`, `app/assistant.py:1`). Clean slate confirmed.

**Two premises in the brief need correction/refinement — surfacing rather than silently working around them:**

1. **Decision #2 ("only two changes needed, everything else stays as-is") is optimistic.** Reading every `bridge/src/*.js` file in full, the two named changes (tenant discovery, message forwarding) ripple into at least three more mechanical changes in the surrounding relay code:
   - `bridge/src/backend-client.js`'s `downloadDocumentImage(tenantId, docId, page)` hits a *per-tenant authenticated backend endpoint* that doesn't exist in commerce — commerce's product images (`app/data.py`/`app/catalog.py`) are plain public/tunnelled URLs. This must become a generic "fetch bytes from this URL" helper, not a renamed method.
   - I read `bridge/node_modules/zca-js/dist/models/Attachment.d.ts`: `AttachmentSource = string | {data: Buffer, filename, metadata}`. Every existing use in `bridge/src/tenant-session.js`'s `buildSendMessageArg()` passes the `{data: Buffer, ...}` form, never a bare string. [Unverified] I did not find zca-js runtime source or docs confirming what the bare-`string` variant means (my best inference, given `qrPath` is a local disk path elsewhere in this codebase, is that it's a **local filesystem path**, not a fetchable remote URL) — I have not run this live. **Treat "does zca-js accept a public image URL directly" as an open spike, not an assumption** — if wrong, the sidecar needs the URL-download step anyway (item above), so the fallback plan is unaffected either way.
   - Decision #4 requires **one Zalo send per carousel element, each with its own caption** — today's `tenant-session.js` message listener calls `sendReply()` exactly **once** per inbound message. Supporting per-element sends means restructuring that listener from "call once" to "loop N times," not just changing what goes inside one call.

2. **Decision #3's "`zalo_login_status` the sidecar reports back" implies push.** I'm proposing **pull** instead: commerce proxies live to the sidecar's existing `GET /tenants/:id/qr-status` on demand (exactly how `bridge`'s own status-server is polled today). Push would require a new inbound endpoint on commerce + write coupling, which is more machinery than decision #2 scoped. Flagging this as a deliberate deviation for the user to confirm, not a silent substitution.

**Two additional real gaps found by close reading, independent of the brief's framing:**

3. **`app/engine.py:424` hardcodes `channel="facebook"`** in `_submit()`. This is harmless today (Facebook is the only channel), but if left as-is, **every Zalo order will be silently mislabeled `"facebook"`** in `orders.db`. Needs fixing as part of this work, not a Zalo-specific hack.

4. **Text-alias coverage claim in decision #4 is not quite complete.** I inventoried every `quick_replies` list in `engine.py` against every free-text alias block. Every button target has a text alias **except `MENU_ORDER`/`CHECKOUT_BACK`** ("🛒 Xem sản phẩm", "➕ Thêm sản phẩm", "🔙 Đổi sản phẩm", "🔙 Đổi món") — none of these have a literal exact-match alias; typing them today falls through to `_ai_reply()` (AI consultation), which is a soft, non-deterministic path. On Messenger this is invisible because the button tap always works regardless. **On Zalo there is no button at all**, so this is the one gap in "engine.py already covers every button" that must be closed.

5. **No service-to-service auth precedent anywhere in this repo.** `bridge/src/backend-client.js` calls `backend` with zero auth header of any kind — same trust level commerce's `/webhook` already has (no signature check, just plaintext JSON). I'm flagging this explicitly per the brief's ask, and recommending the new endpoint go **one notch better** than existing precedent (see Step 6) rather than silently matching the zero-auth status quo.

---

## Ordered implementation plan

### Step 1 — `commerce/app/stores.py`: add the per-store Zalo flag
Add a single new field, `zalo_enabled: bool` (default `False`), following the exact same pattern as `fb_page_id`/`fb_page_token`:
- Add to each seed dict in `_STORES` (default `False`).
- Add `"zalo_enabled"` to the `_EDITABLE` tuple (line ~201) so `update_store()` picks it up via `PUT`-merge.
- Add default in `create_store()` (line ~171-198).
- Round-trip it in `_persist()` (write) and `_load()` (read) for user-created stores.

No new fields needed for "which sidecar tenant" — **store_id doubles as the sidecar's tenant id** directly (1 store = 1 store_id = 1 Zalo session), so there's no separate mapping table to invent.

`zalo_login_status` is deliberately **not** persisted here (see Finding #2 above) — it's fetched live via proxy in Step 2.

### Step 2 — `commerce/app/main.py`: new endpoints
```python
# a) message relay from the sidecar
@app.post("/channels/zalo/message")
async def zalo_message(request: Request):
    _require_bridge_secret(request)          # see Step 6
    body = await request.json()
    store_id, sender_id, text = body.get("store_id",""), body.get("sender_id"), body.get("text","")
    if not stores.exists(store_id) or not stores.get(store_id).get("zalo_enabled"):
        raise HTTPException(404, "store không bật kênh Zalo")
    replies = engine.handle_or_paused(sender_id, text, store_id, channel="zalo")
    return JSONResponse({"sends": zalo_adapter.to_zalo_sends(replies)})

# b) admin UI proxy to the sidecar's own status API (keeps the sidecar's port
#    server-side only; browser never talks to it directly)
@router.get("/admin/stores/{sid}/zalo/status")
async def zalo_status(sid: str): ...   # httpx GET {ZALO_BRIDGE_URL}/tenants/{sid}/qr-status

@router.get("/admin/stores/{sid}/zalo/qr.png")
async def zalo_qr(sid: str): ...       # httpx GET {ZALO_BRIDGE_URL}/tenants/{sid}/qr.png, stream bytes back
```
- Add `zalo_enabled` to `_store_summary()` (line ~115-130) so both `/api/admin/stores` (sidecar's tenant discovery) and the admin UI see it.
- Add `zalo_enabled: bool = False` / `Optional[bool] = None` to `StoreCreate`/`StoreUpdate` models.

### Step 3 — `commerce/app/engine.py`: two small, targeted changes
1. **Thread `channel` through the entry point** — add `channel: str = "facebook"` param to `handle_or_paused()`/`handle()`, set `sess["channel"] = channel` next to the existing `sess["psid"] = sender_id` line, and change `_submit()`'s `store.create_retail_order(..., channel=sess.get("channel", "facebook"), ...)`. Fixes Finding #3.
2. **Close the `MENU_ORDER` alias gap** — add one more exact-match block next to the existing CHECKOUT/CANCEL/etc. blocks (same style, same house convention):
```python
if low in ("xem san pham", "xem sản phẩm", "san pham", "sản phẩm", "xem menu",
           "xem hang", "xem hàng", "doi san pham", "đổi sản phẩm",
           "doi mon", "đổi món", "them san pham", "thêm sản phẩm",
           "them mon", "thêm món"):
    sess["state"] = "CATEGORY"
    return _show_categories(sid)
```
No other engine.py change is required — every other quick-reply target (`CHECKOUT`, `MENU_CART`, `MENU_TRACK`, `CLEAR_CART`, `MENU`, `CANCEL`, `SUBMIT`, `PAY::COD`, `PAY::Chuyển khoản`) already has a confirmed working text alias.

### Step 4 — new file `commerce/app/zalo_adapter.py`
Pure, sync, no I/O — converts `engine.handle()`'s neutral message list into `list[{"text": str, "image_url": str|None}]`, one entry per Zalo send. Mirror `messenger.py`'s shape/spirit but simpler (no HTTP call inside this module — the sidecar does the actual sending):
- `type == "text"` → one send, `image_url=None`, quick_replies dropped entirely (decision #4).
- `type == "generic"` → **one send per element**, not batched. Caption = `f"{title}\n{subtitle}"`; if the element has no image (per `_product_card`'s 20-char-button comment, the bare product code lives in the button payload, not the subtitle, when there's no image), append `f"\nMã: {code}"` pulled from `buttons[0]["payload"].split("PROD::")[1]`.

### Step 5 — fork `bridge/` → `commerce/zalo-bridge/`
Copy `index.js`, `package.json`, `package-lock.json`, `src/*` (not `node_modules` — fresh `npm install`).
- **Verbatim, no changes:** `zalo-session.js` (QR/credential flow is fully product-agnostic), `message-handler.js`'s `shouldHandleMessage`/`extractMessageContent` (DM/mention filtering and inbound-attachment extraction have zero commerce-specific logic).
- **`manager.js`:** replace `backendClient.listTenants()` with a call to `GET {COMMERCE_URL}/api/admin/stores`, filter to `zalo_enabled === true`, map `.id` straight to `tenantId`.
- **Rename `backend-client.js` → `commerce-client.js`:** `listTenants()` points at `/api/admin/stores`; replace `ask()` with `askCommerce(storeId, {senderId, text})` → `POST {COMMERCE_URL}/channels/zalo/message`, returns `{sends}`; drop `downloadDocumentImage()`, replace with a generic `downloadImageByUrl(url)` (plain fetch+buffer) per Finding #1.
- **`message-handler.js`'s `handleIncomingMessage()`:** loop over `sends[]`, for each entry download `image_url` bytes if present and call `sendReply` **once per entry** (contract change: `sendReply(text, imageAttachment|null)` called N times instead of once with a batched array) — this is the concrete fix for the "one caption per carousel item" requirement (Finding #1, item 3).
- **`tenant-session.js`:** minimal change — pass the same per-call `sendReply` callback down; `buildSendMessageArg()` simplifies to build a single-image (or no-image) `sendMessage` arg per call instead of batching multiple images.
- **`status-server.js`, `index.js`:** copy essentially verbatim; rename `BACKEND_URL` → `COMMERCE_URL` for clarity (this is a fork living in the same monorepo as the original `bridge`+`backend`, so keeping the old name risks real confusion); pick a distinct default `STATUS_PORT` (e.g. `4102`, avoiding collision with `bridge`'s `4002`); own `DATA_DIR` (e.g. `commerce/zalo-bridge/data/<store_id>/`) — fully separate credentials/QR storage from `bridge/data/`.

### Step 6 — trust boundary (Finding #5)
Recommend **localhost-only binding** for both the sidecar's status server and commerce's new `/channels/zalo/message` endpoint as the primary control (cheapest, and it's a strict improvement over the existing zero-control precedent in `bridge`↔`backend` and commerce's own `/webhook`). Optionally layer a shared secret (`ZALO_BRIDGE_SECRET` env var, checked via an `X-Bridge-Secret` header) on both directions (commerce→sidecar proxy calls, sidecar→commerce message-forward calls) for defense in depth — following the same "simple env var, no abstraction" style as `PAGE_ACCESS_TOKEN`. [Unverified]/[Inference]: whether the deployment actually runs both processes on the same host (making localhost-binding sufficient) is an assumption from the brief's "sidecar service" framing — confirm before relying on it as the sole control.

### Step 7 — `commerce/admin/src/pages/StoreDetailPage.jsx`
In `ConfigTab`, add a new card next to "Kết nối Fanpage" (same `card`/`Field` conventions, same file): a checkbox bound to `form.zalo_enabled` (saved via the existing `PUT` flow), and — when enabled — a 3s-polling `useEffect` hitting the new `GET /api/admin/stores/{id}/zalo/status` proxy, rendering the QR image (`/api/admin/stores/{id}/zalo/qr.png`) with the copy "quét mã QR bằng đúng tài khoản Zalo của cửa hàng" for `awaiting_qr`, green text for `logged_in`, red for `error`. Include a note that toggling `zalo_enabled` on requires restarting `zalo-bridge` to pick up the new tenant (manager.js discovers tenants once at startup only — same limitation CLAUDE.md already documents for the original `bridge`).

### Step 8 — `commerce/admin/src/lib/api.js`
Add `getZaloStatus: (id) => request(`/api/admin/stores/${id}/zalo/status`)`.

### Step 9 — env/config + docs
`commerce/.env`: `ZALO_BRIDGE_URL`, optional `ZALO_BRIDGE_SECRET`. `commerce/zalo-bridge/` env: `COMMERCE_URL`, matching `ZALO_BRIDGE_SECRET`, `STATUS_PORT`, `DATA_DIR`. Update root `CLAUDE.md` with a new `commerce/zalo-bridge/` section mirroring the existing `bridge/` section, since that file is the explicit onboarding doc for this repo.

### Step 10 — manual verification (no automated suite exists for `commerce`)
Exercise `POST /channels/zalo/message` directly for a `zalo_enabled` store (welcome, multi-element carousel, add-to-cart, submit); run the forked sidecar against a disposable Zalo account end-to-end; confirm `orders.db`'s `channel` column reads `"zalo"` (regression check for Step 3).

### Critical Files for Implementation
- /Users/nguyenddb2/Desktop/zalo-rag-bot/commerce/app/main.py
- /Users/nguyenddb2/Desktop/zalo-rag-bot/commerce/app/engine.py
- /Users/nguyenddb2/Desktop/zalo-rag-bot/commerce/app/stores.py
- /Users/nguyenddb2/Desktop/zalo-rag-bot/bridge/src/tenant-session.js (fork source for `commerce/zalo-bridge/src/tenant-session.js`)
- /Users/nguyenddb2/Desktop/zalo-rag-bot/bridge/src/backend-client.js (fork source for `commerce/zalo-bridge/src/commerce-client.js`)
