# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo overview

This repo holds **one product**: `commerce/` — a multi-tenant order-taking chatbot. There is no root `package.json` — always `cd commerce` (or `cd commerce/admin`, `cd commerce/zalo-bridge`) first.

`commerce/` — multi-tenant order-taking chatbot over **Facebook Messenger** (webhook), **Zalo OA** (webhook, framework-only — no official docs yet, see below), and **Zalo personal accounts** (via a forked sidecar, `commerce/zalo-bridge/`), for retail/food businesses. Also ships its own admin web app (`commerce/admin/`, React) served by the same FastAPI process. Python/FastAPI + a small Node.js sidecar.

`reference/` is explicitly **not shipped code** — prototype/scraped data kept only for comparison.

Note: an earlier, unrelated Zalo RAG chatbot product (`backend/` + `bridge/`, Node.js) that used to live alongside `commerce/` in this same repo has been **removed entirely** (both the working tree and git history going forward) — don't assume those directories, or the design docs that described them (`docs/specs/2026-09-04-zalo-rag-bot-design.md` and similar), still apply to anything in this repo.

---

## `commerce/` (Messenger commerce bot — Python/FastAPI)

**Run:** `cd commerce && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && cp .env.example .env` (fill in at least one of `GROQ_API_KEY`/`GEMINI_API_KEY` to enable AI replies), then `uvicorn app.main:app --host 127.0.0.1 --port 8200`.
**No automated test suite exists for this subproject** — verify changes by hitting `POST /simulator/send` (see below) or driving `app.engine.handle()` directly in a `python3 -c` snippet.
**Admin UI build:** `cd commerce/admin && npm install && npm run build` — outputs static files to `commerce/static/admin/`, served by the FastAPI app at `/admin`. `main.py` only mounts `/admin` if that directory exists, so a fresh checkout needs a build before the admin panel is reachable. Run `npm run dev` inside `commerce/admin/` for hot-reload during UI work (proxies `/api` to `:8200`).

**Entry points:** `POST/GET /webhook` (real Facebook Messenger), `POST /simulator/send` `{sender_id, text, store_id?}` → `{messages}` (no Facebook round-trip, use this for quick manual testing), `GET /` (chat simulator HTML page), `/api/admin/stores*` (store CRUD used by the admin UI).

**Multi-tenant model (`app/stores.py`):** each store can have up to one account per **channel type** — `channels` is a dict keyed by `CHANNEL_TYPES = ("facebook", "zalo_oa", "zalo_personal")` (NOT a list — one Fanpage/OA/Zalo-personal-account per store per channel type; two stores can't share the same `page_id`/`oa_id`, enforced by `set_channel()`/`create_store()`/`update_store()` raising `ValueError`). `channels.facebook` (`page_id`, `page_token`) is the source of truth; the old flat `fb_page_id`/`fb_page_token` fields are kept as a **read-only derived** mirror (synced both ways) so `messenger.py`/older code paths don't break. `channels.zalo_personal` is just `{"enabled": bool}` — Zalo personal credentials/QR live on disk in the `zalo-bridge` sidecar, not in commerce's config. `channels.zalo_oa` fields are **placeholders** (`[Unverified]` — no official Zalo OA API docs were available when this was built: payload shape, webhook signature/verify mechanism, send-message endpoint, and token refresh are all unconfirmed); `/webhook/zalo-oa` in `main.py` only routes to a store and then no-ops until real docs land. `zalo_enabled` (used by the sidecar to discover which stores to open a Zalo session for) is a derived boolean = `channels.zalo_personal.enabled`. Three built-in demo stores (`default`, `shop2`, `chao`) are hardcoded Python dicts seeded from `app/catalog.py`/`app/data.py`; their menus are read-only via the admin API. Stores created through the admin UI (`POST /api/admin/stores`) are held in memory and persisted to `app/stores_config.json` (gitignored) so they survive a restart; their menus are fully editable. `app/catalog.py` (626 products) is machine-generated from a scrape — its own docstring says not to hand-edit it.

**Credentials are plaintext.** `stores_config.json` (gitignored) stores `page_token`/`app_secret`/`oa_access_token`/`oa_refresh_token` as plain strings, same precedent as the pre-existing `fb_page_token`. The admin API (`_channel_public()` in `main.py`) never echoes these back — only booleans like `has_page_token`. There's no at-rest encryption; don't assume there is.

**Conversation engine (`app/engine.py`):** `handle(sender_id, text, store_id, channel="facebook")` is a per-`(store_id, channel, sender_id)` state machine held in the in-process `SESSIONS` dict (no persistence — restarting the process drops all in-flight carts/checkouts). The `channel` key dimension exists so a Facebook PSID and a Zalo user id that happen to collide (both are numeric strings, different id spaces) don't share a cart. `channel` also gets written into `store.create_retail_order(..., channel=...)` (column values: `"facebook"` / `"zalo_oa"` / `"zalo_personal"`, matching `stores.CHANNEL_TYPES`) — the `fb_psid` column name was kept as-is (not renamed) even though it now also holds Zalo user ids, to avoid a DB migration. States: `MENU`/`CATEGORY`/`QTY_INPUT`/`SIZE_INPUT`/`INFO`/`PAYMENT`/`REVIEW`. Free text that doesn't match a button payload or an exact-match alias falls through to `assistant.answer_retail()` for AI/local-rule handling. **Always call `handle_or_paused()`, not `handle()` directly** — it's the only place that checks a store's `status == "paused"` gate before running any bot logic; `/webhook`, `/simulator/send`, and `/channels/zalo/message` in `main.py` all go through it.

**AI layer (`app/assistant.py`):** tries Groq first, then Gemini, then falls back to keyword-based local rules (`_retail_local_answer`/`_retail_match_codes`) if both LLM calls fail — both providers have hit free-tier limits during real usage, so the local fallback path is exercised in practice, not just theoretically. The LLM's `is_complaint` flag (not local keyword matching) is what decides whether a customer message triggers product-carousel logic vs. a plain apology + order-flagging (`engine._flag_recent_order`, looked up by Messenger PSID, surfaced in the admin Orders tab) — this split exists because letting local keyword rules independently decide "show a carousel" caused false positives on complaint messages that happened to mention a color/product word. Category matching (`_match_category`) is generic: it matches against the _store's own_ category list, not a hardcoded vocabulary — this is what lets a completely different business (e.g. a food stall) work with zero code changes.

**Variant/size handling is store-configurable, not hardcoded to shoe sizes.** Each store has `variant_mode`: `"so"` (numeric range, `variant_min`/`variant_max`, e.g. shoe sizes 24–46), `"nhan"` (a free-form label list, e.g. `S,M,L,XL`), or `"khong_co"` (no variant — quantity only, e.g. food). `assistant._parse_sizes`/`engine._extract_size_qty` branch on this per-store config; when adding a business type that needs different parsing entirely (not just a different numeric range or label set), you'll need to extend these functions, not just store config.

**Known encoding gotcha:** `engine.handle()` normalizes incoming text to Unicode **NFC** before any exact-string matching. Some clients send Vietnamese text as NFD (decomposed combining marks) — visually identical but byte-different, so every `if low in (...)` alias check would otherwise silently fail for those users. If you add new free-text matching elsewhere (outside `handle()`), make sure the input has gone through this normalization or apply it yourself.

**Known Messenger platform gotcha:** quick-reply/button titles are hard-capped at 20 characters by Facebook; product codes are `<base_code>-<COLOR>` (up to 16 chars seen in the current catalog) — don't embed a code into a button title alongside other text (e.g. `"🛒 Chọn " + code`) without checking the combined length, or the trailing characters get silently truncated.

**Config reload gotcha:** `commerce/.env` and `app/stores_config.json` are only read at process startup (`load_dotenv()` / `stores._load()` at import time). Restart `uvicorn` after editing `.env` directly or after any change that isn't going through the `/api/admin/stores*` endpoints (which do update in-memory state live, no restart needed).

**Zalo relay endpoint (`POST /channels/zalo/message`):** called by the `commerce/zalo-bridge/` sidecar (below), not by Zalo directly — there's no external id to route on (unlike FB/Zalo OA), the sidecar already knows which `store_id` its session belongs to. Guarded by `_require_bridge_secret()`: optional shared-secret header `X-Bridge-Secret`, checked only if `ZALO_BRIDGE_SECRET` env var is set (empty = no check). The primary trust boundary is meant to be binding both processes to localhost; the header is a defense-in-depth extra, not the only guard.

## `commerce/zalo-bridge/` (Zalo personal-account transport for commerce — Node/Express)

A fork of `bridge/` (see above), adapted to sit in front of `commerce/` instead of `backend/`. Handles Zalo **personal accounts** only (not Zalo OA) — `zca-js` needs a live logged-in session per account, which doesn't fit a stateless webhook, hence a separate always-running sidecar process rather than folding this into the FastAPI app.

**Run:** `cd commerce/zalo-bridge && npm install && COMMERCE_URL=http://localhost:8200 node index.js` (status API on port `4102` via `STATUS_PORT` — deliberately different from `bridge/`'s `4002` so both can run side by side). Optional: `ZALO_BRIDGE_SECRET` (shared-secret header sent to commerce, see above), `DATA_DIR` (defaults to `commerce/zalo-bridge/data/`, entirely separate from `bridge/data/`).

**Discovery is one-shot, same limitation as `bridge/`:** `src/manager.js` calls `GET {COMMERCE_URL}/api/admin/stores` once at startup and opens one `zca-js` session (via `src/tenant-session.js`/`src/zalo-session.js`, copied near-verbatim from `bridge/`) per store where `zalo_enabled === true`. **Turning on the Zalo-personal channel for a store (or a new store) requires restarting this sidecar** — it does not poll. FB and Zalo OA don't have this limitation (commerce reads its store registry live on every webhook request); this sidecar is the one channel where adding a tenant needs an operator restart.

**Differs from `bridge/` in how replies are sent:** `commerce/app/zalo_adapter.py` (`to_zalo_sends()`) already flattens an `engine.handle()` reply into `sends: [{text, image_url|null}, ...]` — one send-worthy unit per Zalo message (product carousels become one message per product, quick-replies are dropped since Zalo has no button UI). `src/message-handler.js`'s `handleIncomingMessage()` therefore calls `sendReply()` **once per entry in `sends[]`**, not once with a merged image array like `bridge/` does. Images are product photo URLs (public/tunneled), fetched via `src/commerce-client.js`'s `downloadImageByUrl()` — this replaces `bridge/`'s `downloadDocumentImage()`, which hit an authenticated per-tenant `backend` endpoint that doesn't exist on `commerce`. A broken/unreachable image URL degrades to a text-only send, it doesn't drop the whole reply.

**Known limitation (in scope, not fixed here):** inbound images from Zalo customers are downloaded by `extractMessageContent()` (same as `bridge/`) but never forwarded to `commerce` — `engine.handle()` has no image parameter (unlike the older Zalo RAG `backend`), so only the caption/text is sent to `/channels/zalo/message`. This is a deliberate scope cut, not a bug.

## Lệnh Python

Dùng trực tiếp interpreter trong venv, KHÔNG dùng `source .venv/bin/activate`:

- Chạy script: `commerce/.venv/bin/python -c "..."`
- Test: `commerce/.venv/bin/pytest -q`
- Cài gói: `commerce/.venv/bin/pip install X`
