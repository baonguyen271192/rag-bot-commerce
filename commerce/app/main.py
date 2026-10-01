"""Commerce — bot đặt đơn đa cửa hàng, đa ngành. Tách ra từ dự án BQ (giữ nguyên
logic hội thoại) để dùng chung cho nhiều tenant, nhiều kênh (Facebook hiện tại;
Zalo/kênh khác nối vào bằng cách gọi engine.handle() rồi tự map định dạng gửi).

Mặt tiền:
  1) Webhook Facebook Messenger:  GET/POST /webhook
  2) REST quản lý bot (console):   /api/stores, /api/admin/stores*
  3) Trình giả lập web để test:    GET / + POST /simulator/send
"""

from __future__ import annotations

import os
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv()

# `crypto` import ĐẦU TIÊN, TRƯỚC mọi module khác — module này raise RuntimeError ngay
# lúc import nếu thiếu/sai `CREDENTIALS_KEY` (fail-fast, Q2), để app dừng ngay lúc
# khởi động uvicorn thay vì đợi tới request đầu tiên chạm credentials mới lộ lỗi.
from . import crypto  # noqa: F401

# zalo_oa: import sẵn cho khi câu 3 (tài liệu Zalo OA) được chốt — webhook_zalo_oa()
# dưới đây hiện DỪNG trước khi gọi tới nó (xem TODO trong hàm), nên module này CHƯA
# thực sự được gọi, chỉ giữ chỗ để không phải sửa lại import khi có tài liệu.
from . import (  # noqa: F401
    auth, business_types, engine, messenger, plans, repository, store, stores, zalo_adapter, zalo_oa,
)

app = FastAPI(title="Commerce — Bot đặt đơn đa cửa hàng")

# allow_origins=["*"] không tương thích với cookie phiên đăng nhập (allow_credentials
# đòi hỏi origin CỤ THỂ, trình duyệt từ chối "*" kèm credentials) — ADMIN_ORIGINS chỉ
# thật sự cần khi chạy `vite dev` ở port riêng (localhost:5173); production build SPA
# same-origin nên không phụ thuộc CORS.
ADMIN_ORIGINS = [o.strip() for o in os.environ.get(
    "ADMIN_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=ADMIN_ORIGINS, allow_credentials=True,
                    allow_methods=["*"], allow_headers=["*"])

store.init_db()

VERIFY_TOKEN = os.environ.get("VERIFY_TOKEN", "commerce-verify")
STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")

# TODO(cần chốt câu 3): verify token thật cho webhook Zalo OA — CHƯA có tài liệu chính
# thức (chữ ký X-ZEvent-Signature? verify token kiểu FB?). Đặt placeholder để không
# đụng VERIFY_TOKEN của Facebook.
VERIFY_TOKEN_ZALO_OA = os.environ.get("VERIFY_TOKEN_ZALO_OA", "")

# Kênh Zalo cá nhân: sidecar commerce/zalo-bridge/ relay tin qua /channels/zalo/message.
# Trust boundary (câu 11) chính là bind localhost 2 chiều; ZALO_BRIDGE_SECRET là lớp
# phòng vệ THÊM, tuỳ chọn (rỗng = không kiểm, giống PAGE_ACCESS_TOKEN không bắt buộc).
ZALO_BRIDGE_SECRET = os.environ.get("ZALO_BRIDGE_SECRET", "")


def _require_bridge_secret(request: Request) -> None:
    if not ZALO_BRIDGE_SECRET:
        return
    if request.headers.get("X-Bridge-Secret") != ZALO_BRIDGE_SECRET:
        raise HTTPException(401, "thiếu/sai X-Bridge-Secret")


def _current_user_or_service(request: Request) -> dict | None:
    """GET /api/admin/stores có 2 caller hoàn toàn khác nhau: (a) zalo-bridge sidecar
    poll 1 lần lúc khởi động bằng X-Bridge-Secret, KHÔNG có cookie trình duyệt — vẫn
    phải thấy TOÀN BỘ store mọi tenant như trước khi có auth, nếu không sidecar gãy
    ngay; (b) admin UI dùng cookie phiên, CHỈ được thấy store của đúng tenant mình (hoặc
    mọi store nếu là super_admin). Trả None cho case (a) để route phân biệt được, còn
    case (b) trả user dict như get_current_user bình thường."""
    if ZALO_BRIDGE_SECRET and request.headers.get("X-Bridge-Secret") == ZALO_BRIDGE_SECRET:
        return None
    return auth.get_current_user(request)


# ---------------- Facebook Messenger webhook ----------------

@app.get("/webhook")
async def verify(request: Request):
    """Facebook gọi 1 lần để xác minh webhook."""
    params = request.query_params
    if params.get("hub.mode") == "subscribe" and params.get("hub.verify_token") == VERIFY_TOKEN:
        return Response(content=params.get("hub.challenge", ""), media_type="text/plain")
    return Response(content="Verification failed", status_code=403)


@app.post("/webhook")
async def webhook(request: Request):
    """Nhận sự kiện tin nhắn từ Messenger và trả lời."""
    body = await request.json()
    if body.get("object") != "page":
        return JSONResponse({"status": "ignored"})

    for entry in body.get("entry", []):
        # entry.id = Page ID nhận tin → tra ra cửa hàng (đa Fanpage). Không khớp store nào
        # (page lạ/chưa cấu hình, hoặc kênh facebook đang enabled=false) → BỎ QUA entry này,
        # KHÔNG fallback về "default" (lỗ hổng rò rỉ xuyên tenant: trước đây tin của 1 page
        # lạ bất kỳ bị gán thẳng vào store "default", tạo SESSION/đơn cho đúng data tenant
        # đó dù page không hề thuộc về họ).
        st = stores.by_page_id(entry.get("id", ""))
        if not st:
            print(f"[webhook] ⚠ BỎ QUA entry từ page_id lạ {entry.get('id', '')!r} — "
                  f"chưa cấu hình store nào (hoặc kênh facebook đang tắt)")
            continue
        store_id = st["id"]
        token = st["fb_page_token"]
        # Điểm chốt gate gói dịch vụ cho kênh facebook (cùng helper dùng ở zalo_message()) —
        # HIỆN LUÔN True (plans.PLANS cho "facebook" ở mọi gói), đặt sẵn ở đây để nếu sau
        # này có gói không gồm facebook, chỉ cần sửa plans.py, không phải sửa lại main.py.
        if not stores.channel_allowed_by_plan(store_id, "facebook"):
            plan_id = stores.plan_of(store_id)
            print(f"[webhook] ⚠ store {store_id!r} bật facebook nhưng gói {plan_id!r} "
                  f"không bao gồm — bỏ qua entry")
            continue
        for event in entry.get("messaging", []):
            sender_id = event.get("sender", {}).get("id")
            if not sender_id:
                continue
            text = None
            if "message" in event:
                msg = event["message"]
                if msg.get("is_echo"):
                    continue
                if msg.get("quick_reply"):
                    text = msg["quick_reply"].get("payload")
                else:
                    text = msg.get("text")
            elif "postback" in event:
                text = event["postback"].get("payload")
            if text is None:
                continue
            print(f"[webhook] ← NHẬN [{store_id}] từ {sender_id}: {text!r}")
            replies = engine.handle_or_paused(sender_id, text, store_id)
            print(f"[webhook] → sinh {len(replies)} tin trả lời cho {sender_id}")
            await messenger.send_all(sender_id, replies, token)

    return JSONResponse({"status": "ok"})


# ---------------- Webhook Zalo OA (khung — chờ tài liệu, câu 3) ----------------
# CHƯA có code Zalo OA thật trong repo (đã grep, xác nhận ở kế hoạch). Payload/verify
# dưới đây là PLACEHOLDER, không phải field thật của Zalo OA — chỉ đủ để route "không
# khớp store nào → ignore" và không vỡ khi có request thật gửi tới trước khi có tài liệu.

@app.get("/webhook/zalo-oa")
async def verify_zalo_oa(request: Request):
    # TODO(cần chốt câu 3): cơ chế verify thật của Zalo OA (chữ ký X-ZEvent-Signature?
    # verify token kiểu FB qua query param?) — CHƯA xác minh, tạm mô phỏng kiểu FB.
    params = request.query_params
    if VERIFY_TOKEN_ZALO_OA and params.get("verify_token") == VERIFY_TOKEN_ZALO_OA:
        return Response(content=params.get("challenge", ""), media_type="text/plain")
    return Response(content="Verification failed", status_code=403)


@app.post("/webhook/zalo-oa")
async def webhook_zalo_oa(request: Request):
    # TODO(cần chốt câu 3): tên field payload thật (oa_id người nhận? user_id người gửi?
    # text ở đâu?) CHƯA xác minh — placeholder dưới đây có thể sai hoàn toàn. Vì vậy chỉ
    # route tới store rồi DỪNG (không parse sender/text, không trả lời) cho tới khi có
    # tài liệu chính thức, tránh trả lời sai hoặc crash trên payload thật.
    body = await request.json()
    oa_id = body.get("oa_id", "")  # TODO(cần chốt câu 3)
    st = stores.by_channel("zalo_oa", oa_id)
    if not st:
        # oa_id lạ/không khớp store nào → ignore, không trả lời (tránh trả lời nhầm OA lạ).
        return JSONResponse({"status": "ignored"})
    # TODO(cần chốt câu 3): khi có tài liệu, thay đoạn dưới bằng parse sender_id/text thật
    # rồi gọi engine.handle_or_paused(sender_id, text, st["id"], channel="zalo_oa") và
    # zalo_oa.send_all(sender_id, replies, stores.channel_config(st["id"], "zalo_oa")).
    # TODO(P0-2, khi bật logic thật ở trên): thêm gate gói dịch vụ TRƯỚC khi gọi
    # engine.handle_or_paused, giống hệt pattern ở zalo_message() bên dưới:
    #   if not stores.channel_allowed_by_plan(st["id"], "zalo_oa"): log + return ignored.
    # Hiện plans.PLANS cho "zalo_oa" ở MỌI gói (basic/pro/internal_unlimited) nên chưa có
    # ca nào bị chặn thật, nhưng để sẵn điểm gọi khi route này thật sự xử lý tin nhắn.
    return JSONResponse({"status": "ignored"})


# ---------------- Kênh Zalo cá nhân (relay từ sidecar commerce/zalo-bridge/) ----------------

@app.post("/channels/zalo/message")
async def zalo_message(request: Request):
    """Sidecar commerce/zalo-bridge/ (giữ phiên zca-js) gọi vào đây mỗi khi khách nhắn
    qua Zalo cá nhân. Không có external id để route (khác FB/Zalo OA) — sidecar tự biết
    store_id của phiên nó đang giữ (discover 1 lần lúc start qua zalo_enabled)."""
    _require_bridge_secret(request)
    body = await request.json()
    store_id = body.get("store_id", "")
    sender_id = body.get("sender_id")
    text = body.get("text", "")
    if not stores.exists(store_id) or not stores.zalo_enabled(store_id):
        raise HTTPException(404, "store không bật kênh Zalo")
    # Gate GÓI DỊCH VỤ tại runtime (P0-2) — kênh có thể đã từng bật lúc tenant còn ở gói
    # cao hơn, rồi bị hạ gói sau đó. `set_channel()` + `stores.set_plan()` (Q3) đã lo tắt
    # cờ enabled trong đa số trường hợp, nhưng gate NÀY là phòng hờ đường khác bật lại cờ
    # (vd sửa thẳng DB, hoặc race condition giữa 2 lần gọi). Fail-closed: không rõ/không
    # còn quyền -> im lặng bỏ qua, KHÔNG trả lời khách (Q2-a) — không dùng 404/403 ở đây để
    # sidecar không hiểu nhầm là lỗi cấu hình rồi spam retry/log.
    if not stores.channel_allowed_by_plan(store_id, "zalo_personal"):
        plan_id = stores.plan_of(store_id)
        print(f"[zalo] ⚠ store {store_id!r} bật zalo_personal nhưng gói {plan_id!r} "
              f"không bao gồm — bỏ qua tin nhắn (không trả lời khách)")
        return JSONResponse({"sends": []})
    replies = engine.handle_or_paused(sender_id, text, store_id, channel="zalo_personal")
    return JSONResponse({"sends": zalo_adapter.to_zalo_sends(replies)})


# ---------------- Trình giả lập web ----------------

@app.get("/")
async def index():
    return FileResponse(os.path.join(STATIC_DIR, "simulator.html"))


@app.post("/simulator/send")
async def simulator_send(request: Request):
    """Nhận {sender_id, text, store_id?} từ trang giả lập, trả về danh sách message.
    store_id cho phép demo nhiều cửa hàng khác nhau trên cùng máy."""
    body = await request.json()
    sender_id = body.get("sender_id", "sim-user")
    text = body.get("text", "")
    store_id = body.get("store_id", "default")
    if not stores.exists(store_id):
        store_id = "default"
    replies = engine.handle_or_paused(sender_id, text, store_id)
    return JSONResponse({"messages": replies})


@app.get("/health")
async def health():
    return {"status": "ok"}


# ---------------- Trang công khai cho Meta App Review (Privacy Policy / Terms) ----------------

@app.get("/privacy")
async def privacy():
    return FileResponse(os.path.join(STATIC_DIR, "privacy.html"))


@app.get("/terms")
async def terms():
    return FileResponse(os.path.join(STATIC_DIR, "terms.html"))


# ==================== Quản lý Bot (console) ====================

router = APIRouter(prefix="/api")

COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").strip().lower() not in ("0", "false", "")


class LoginBody(BaseModel):
    email: str
    password: str


@router.post("/auth/login")
def auth_login(body: LoginBody, response: Response):
    user = repository.get_user_by_email(body.email.strip().lower())
    if not user or user.get("status") != "active" or not auth.verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Email hoặc mật khẩu không đúng")
    token = auth.create_session_token(user)
    response.set_cookie(
        auth.COOKIE_NAME, token, max_age=auth.SESSION_TTL_SECONDS, httponly=True,
        secure=COOKIE_SECURE, samesite="lax", path="/",
    )
    return {"id": user["id"], "email": user["email"], "role": user["role"], "tenant_id": user.get("tenant_id")}


@router.post("/auth/logout")
def auth_logout(response: Response):
    response.delete_cookie(auth.COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/auth/me")
def auth_me(user: dict = Depends(auth.get_current_user)):
    return {"id": user["uid"], "email": user["email"], "role": user["role"], "tenant_id": user.get("tenant_id")}


class ChangePasswordBody(BaseModel):
    old_password: str
    new_password: str


@router.post("/auth/change-password")
def auth_change_password(body: ChangePasswordBody, user: dict = Depends(auth.get_current_user)):
    """Tự phục vụ cho user ĐANG đăng nhập (super_admin lẫn tenant_owner) — khác
    `admin_reset_owner_password` (super_admin đặt hộ, không cần biết mật khẩu cũ): ở đây
    BẮT BUỘC xác thực lại mật khẩu cũ trước khi đổi. Không xoay session (cookie hiện vẫn
    hợp lệ tới khi hết TTL) — chấp nhận được ở v1, xem TODO revoke trong kế hoạch."""
    db_user = repository.get_user(user["uid"])
    if not db_user or not auth.verify_password(body.old_password, db_user["password_hash"]):
        raise HTTPException(400, "Mật khẩu cũ không đúng")
    if len(body.new_password) < 6:
        raise HTTPException(400, "Mật khẩu mới cần ít nhất 6 ký tự")
    repository.update_user_password(db_user["id"], auth.hash_password(body.new_password))
    return {"ok": True}


def _channel_public(channel_type: str, cfg: dict) -> dict:
    """Che secret khi trả cho client — chỉ báo boolean 'đã có/chưa', KHÔNG trả token
    thô (page_token/app_secret/oa_access_token/oa_refresh_token)."""
    out = {"enabled": bool(cfg.get("enabled")), "connected": False}
    if channel_type == "facebook":
        out["page_id"] = cfg.get("page_id", "")
        out["has_page_token"] = bool(cfg.get("page_token"))
    elif channel_type == "zalo_oa":
        out["oa_id"] = cfg.get("oa_id", "")  # [Chưa xác minh — câu 3]
        out["has_app_secret"] = bool(cfg.get("app_secret"))
        out["has_oa_access_token"] = bool(cfg.get("oa_access_token"))
        out["has_oa_refresh_token"] = bool(cfg.get("oa_refresh_token"))
        out["token_expires_at"] = cfg.get("token_expires_at", "")
    return out


def _store_summary(st: dict) -> dict:
    tenant = repository.get_tenant(st.get("tenant_id")) if st.get("tenant_id") else None
    plan_id = (tenant or {}).get("plan_id", plans.DEFAULT_PLAN)
    plan_cfg = plans.get(plan_id)
    # None cho 3 cửa hàng demo builtin (chung "tenant-main", không có chủ sở hữu riêng)
    # — admin UI dựa vào None/khác-None để quyết định hiện khối "Tài khoản chủ cửa hàng"
    # hay 1 ghi chú giải thích, KHÔNG coi None là lỗi thiếu dữ liệu.
    owner = repository.get_tenant_owner(st["tenant_id"]) if st.get("tenant_id") else None
    owner_email = owner["email"] if owner else None
    orders = store.list_orders(st["id"])
    n_orders = len(orders)
    # list_orders() trả ORDER BY id DESC -> orders[0] là đơn gần nhất. Admin UI dùng
    # field này để phân biệt "đang mất đơn mới" (có lịch sử, giờ kênh gãy) với "chưa
    # từng nhận đơn" khi hiện cảnh báo "cần xử lý" — order_count một mình không nói lên
    # điều đó (đơn có thể đến từ TRƯỚC khi kênh mất kết nối).
    last_order_at = orders[0]["created_at"] if orders else None
    # BUG TÌM THẤY LÚC TEST (đã sửa): trước đây `connected` tính riêng, KHÔNG xét
    # `channels.facebook.enabled` -> lệch với `channels.facebook.connected` (dùng
    # stores.channel_connected(), CÓ xét enabled) mỗi khi kênh facebook bị tắt qua
    # PUT /api/admin/stores/{sid}/channels/facebook nhưng vẫn còn page_id/page_token cũ.
    # Admin UI (StoreListPage/StoreDetailPage) đọc field phẳng `fb_connected` này để hiện
    # badge "đã kết nối" -> badge sẽ hiện XANH dù kênh đã bị tắt. Dùng chung nguồn tính
    # với `channels.facebook.connected` để 2 field không lệch nhau nữa.
    connected = stores.channel_connected(st["id"], "facebook")
    channels_out = {}
    for ctype in stores.CHANNEL_TYPES:
        cfg = stores.channel_config(st["id"], ctype) or {}
        pub = _channel_public(ctype, cfg)
        pub["connected"] = stores.channel_connected(st["id"], ctype)
        channels_out[ctype] = pub
    return {
        "id": st["id"], "name": st["name"], "shop_label": st.get("shop_label"),
        "business_type": st.get("business_type", "shoe"), "unit": st.get("unit"),
        "has_size": st.get("has_size"), "tone": st.get("tone"),
        "variant_mode": st.get("variant_mode", "so"), "variant_min": st.get("variant_min", 24),
        "variant_max": st.get("variant_max", 46), "variant_labels": st.get("variant_labels", []),
        "custom_prompt": st.get("custom_prompt", ""),
        "fb_page_id": st.get("fb_page_id", ""),
        "fb_connected": connected, "status": st.get("status", "active"),
        "channels": channels_out,
        "zalo_enabled": stores.zalo_enabled(st["id"]),
        "builtin": stores.is_builtin(st["id"]),
        "plan_id": plan_id, "plan_label": plan_cfg["label"],
        "plan_features": sorted(plan_cfg["features"]),
        "owner_email": owner_email,
        "menu_count": len(st.get("products", {})),
        "order_count": n_orders,
        "last_order_at": last_order_at,
    }


@router.get("/stores")
def list_stores(business_type: Optional[str] = None):
    """Danh sách cửa hàng — lọc theo ngành nếu truyền business_type."""
    out = [{"id": s["id"], "name": s["name"], "business_type": s.get("business_type", "shoe")}
           for s in stores.all_stores()]
    if business_type:
        out = [s for s in out if s["business_type"] == business_type]
    return out


@router.get("/admin/business-types")
def admin_business_types(user: dict = Depends(auth.get_current_user)):
    """Danh sách ngành hàng hỗ trợ sẵn (nhãn + mặc định biến thể/đơn vị) — admin UI vẽ
    theo danh sách này thay vì hardcode 2 lựa chọn cố định, để thêm 1 ngành mới chỉ cần
    sửa `business_types.py`, không cần đổi/build lại phần chọn ngành trên React."""
    return business_types.list_types()


@router.get("/admin/plans")
def admin_plans(user: dict = Depends(auth.get_current_user)):
    return plans.list_plans()


@router.get("/admin/stores")
def admin_list_stores(caller: Optional[dict] = Depends(_current_user_or_service)):
    all_st = stores.all_stores()
    # caller is None -> zalo-bridge sidecar (X-Bridge-Secret), giữ nguyên hành vi cũ:
    # thấy TOÀN BỘ store mọi tenant, cần cho vòng lặp discover zalo_enabled lúc khởi động.
    if caller is None or caller["role"] == "super_admin":
        return [_store_summary(s) for s in all_st]
    return [_store_summary(s) for s in all_st if s.get("tenant_id") == caller.get("tenant_id")]


@router.get("/admin/stores/{sid}")
def admin_store_detail(sid: str, user: dict = Depends(auth.require_store_access)):
    if not stores.exists(sid):
        raise HTTPException(404, "Cửa hàng không tồn tại")
    st = stores.get(sid)
    return {**_store_summary(st), "policies": st.get("policies", {}),
            "categories": st.get("categories", []), "menu": list(st.get("products", {}).values())}


class StoreCreate(BaseModel):
    id: str
    name: str
    business_type: str = "food"
    has_size: Optional[bool] = None
    variant_mode: Optional[str] = None   # 'so' | 'nhan' | 'khong_co'
    # Optional (không đặt default cụ thể như 24/46/[]) — CHỦ Ý, để .dict(exclude_unset=True)
    # bên dưới có thể phân biệt "caller không gửi field" (rơi về mặc định của NGÀNH đã
    # chọn trong create_store()) với "caller gửi rỗng/0 một cách cố ý". Trước đây các field
    # này có default cụ thể (24/46/[]) nên Pydantic LUÔN điền sẵn dù client không gửi, khiến
    # nhánh "dùng mặc định ngành" trong create_store() không bao giờ chạy được — bug tìm
    # thấy khi tạo store ngành 'fashion' (variant_mode 'nhan') chỉ truyền business_type,
    # đúng theo thiết kế, vẫn bị báo lỗi "cần ít nhất 1 nhãn" dù registry đã có sẵn nhãn mặc
    # định S/M/L/XL cho ngành đó.
    variant_min: Optional[int] = None
    variant_max: Optional[int] = None
    variant_labels: Optional[List[str]] = None
    fb_page_id: str = ""
    fb_page_token: str = ""
    tone: str = "warm"
    custom_prompt: str = ""
    owner_email: str = ""
    owner_password: str = ""
    plan_id: str = plans.DEFAULT_PLAN
    tenant_name: Optional[str] = None


@router.post("/admin/stores")
def admin_create_store(body: StoreCreate, user: dict = Depends(auth.require_super_admin)):
    # Tạo tenant mới luôn là super_admin-only ở v1 — self-signup công khai là phase 2
    # (xem kế hoạch), nên đây là điểm DUY NHẤT cấp tài khoản đăng nhập cho chủ shop.
    try:
        st = stores.provision_tenant_store(body.dict(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return _store_summary(st)


class StoreUpdate(BaseModel):
    name: Optional[str] = None
    shop_label: Optional[str] = None
    business_type: Optional[str] = None
    unit: Optional[str] = None
    has_size: Optional[bool] = None
    variant_mode: Optional[str] = None
    variant_min: Optional[int] = None
    variant_max: Optional[int] = None
    variant_labels: Optional[List[str]] = None
    fb_page_id: Optional[str] = None
    fb_page_token: Optional[str] = None
    tone: Optional[str] = None
    status: Optional[str] = None
    custom_prompt: Optional[str] = None
    policies: Optional[Dict[str, str]] = None


@router.put("/admin/stores/{sid}")
def admin_update_store(sid: str, body: StoreUpdate, user: dict = Depends(auth.require_store_access)):
    if not stores.exists(sid):
        raise HTTPException(404, "Cửa hàng không tồn tại")
    try:
        st = stores.update_store(sid, body.dict(exclude_none=True))
    except ValueError as e:
        # update_store() cũng dùng ValueError cho trùng page_id (câu 6) — store đã xác
        # nhận tồn tại ở trên nên lỗi còn lại chỉ có thể là xung đột dữ liệu → 400.
        raise HTTPException(400, str(e))
    return _store_summary(st)


@router.delete("/admin/stores/{sid}")
def admin_delete_store(sid: str, user: dict = Depends(auth.require_super_admin)):
    try:
        stores.delete_store(sid)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


class ResetOwnerPasswordBody(BaseModel):
    new_password: str


@router.post("/admin/stores/{sid}/owner/reset-password")
def admin_reset_owner_password(sid: str, body: ResetOwnerPasswordBody,
                                user: dict = Depends(auth.require_super_admin)):
    """super_admin-only — chủ shop quên mật khẩu thì KHÔNG có luồng tự khôi phục (chưa
    làm gửi email reset), nên admin phải đặt lại hộ. Không phải require_store_access vì
    hành động này SỬA tài khoản (bảng users), không phải sửa dữ liệu store — chặt hơn
    1 bậc so với quyền chỉnh cấu hình cửa hàng thông thường."""
    if not stores.exists(sid):
        raise HTTPException(404, "Cửa hàng không tồn tại")
    if len(body.new_password) < 6:
        raise HTTPException(400, "Mật khẩu cần ít nhất 6 ký tự")
    st = stores.get(sid)
    owner = repository.get_tenant_owner(st["tenant_id"]) if st.get("tenant_id") else None
    if not owner:
        raise HTTPException(400, "Cửa hàng này không có tài khoản chủ sở hữu riêng (cửa hàng demo nội bộ)")
    repository.update_user_password(owner["id"], auth.hash_password(body.new_password))
    return {"ok": True}


class SetPlanBody(BaseModel):
    plan_id: str


@router.put("/admin/stores/{sid}/plan")
def admin_set_plan(sid: str, body: SetPlanBody, user: dict = Depends(auth.require_super_admin)):
    """Đổi gói dịch vụ của TENANT sở hữu store `sid` (Q4: chỉ super_admin — tenant_owner
    không được tự nâng gói để tránh lách thu phí, nên guard bằng require_super_admin thay
    vì require_store_access). `stores.set_plan()` validate plan_id hợp lệ + chặn store
    builtin + (Q3) tự tắt cờ mọi kênh không còn trong gói mới cho MỌI store của tenant."""
    if not stores.exists(sid):
        raise HTTPException(404, "Cửa hàng không tồn tại")
    try:
        st = stores.set_plan(sid, body.plan_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return _store_summary(st)


class ChannelConfigBody(BaseModel):
    # BUG TÌM THẤY LÚC TEST (đã sửa): `enabled: bool = False` (không Optional) khiến
    # body.dict(exclude_none=True) LUÔN có khoá "enabled" dù client không truyền, nên
    # PUT .../channels/facebook chỉ để đổi page_id/page_token (quên gửi "enabled") sẽ
    # VÔ TÌNH tắt kênh (enabled bị ghi đè về False mỗi lần). Đổi Optional[bool] = None để
    # khớp đúng ngữ nghĩa "cập nhật từng phần" như mọi field khác trong model này (page_id/
    # page_token/oa_id/...) — set_channel() merge dict nên field không gửi giữ giá trị cũ.
    enabled: Optional[bool] = None
    # facebook
    page_id: Optional[str] = None
    page_token: Optional[str] = None
    # zalo_oa  [Chưa xác minh tên field — câu 3, placeholder]
    app_id: Optional[str] = None
    app_secret: Optional[str] = None
    oa_id: Optional[str] = None
    oa_access_token: Optional[str] = None
    oa_refresh_token: Optional[str] = None
    token_expires_at: Optional[str] = None


@router.get("/admin/stores/{sid}/channels")
def admin_get_channels(sid: str, user: dict = Depends(auth.require_store_access)):
    if not stores.exists(sid):
        raise HTTPException(404, "Cửa hàng không tồn tại")
    return {ctype: _channel_public(ctype, stores.channel_config(sid, ctype) or {})
            for ctype in stores.CHANNEL_TYPES}


@router.put("/admin/stores/{sid}/channels/{ctype}")
def admin_set_channel(sid: str, ctype: str, body: ChannelConfigBody,
                       user: dict = Depends(auth.require_store_access)):
    if not stores.exists(sid):
        raise HTTPException(404, "Cửa hàng không tồn tại")
    if ctype not in stores.CHANNEL_TYPES:
        raise HTTPException(400, "Loại kênh không hợp lệ")
    # Gate theo GÓI chỉ áp dụng khi khách đang cố BẬT zalo_personal — tắt kênh hoặc sửa
    # field của kênh khác không cần kiểm tra, nên gọi require_feature() TRỰC TIẾP ở đây
    # (không qua Depends) thay vì áp cho mọi request tới route này.
    if ctype == "zalo_personal" and body.enabled:
        auth.require_feature(sid, "zalo_personal")
    try:
        stores.set_channel(sid, ctype, body.dict(exclude_none=True))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return _store_summary(stores.get(sid))


@router.delete("/admin/stores/{sid}/channels/{ctype}")
def admin_remove_channel(sid: str, ctype: str, user: dict = Depends(auth.require_store_access)):
    if not stores.exists(sid):
        raise HTTPException(404, "Cửa hàng không tồn tại")
    if ctype not in stores.CHANNEL_TYPES:
        raise HTTPException(400, "Loại kênh không hợp lệ")
    stores.remove_channel(sid, ctype)
    return {"ok": True}


class MenuItemBody(BaseModel):
    code: str
    name: str
    category: str = "Khác"
    price: int
    color: str = ""
    sizes: Optional[Dict[str, int]] = None


@router.post("/admin/stores/{sid}/menu")
def admin_add_menu(sid: str, body: MenuItemBody, user: dict = Depends(auth.require_store_access)):
    if not stores.exists(sid):
        raise HTTPException(404, "Cửa hàng không tồn tại")
    if stores.is_builtin(sid):
        raise HTTPException(400, "Cửa hàng dựng sẵn — menu chỉ đọc trong demo")
    return stores.add_menu_item(sid, body.dict())


@router.delete("/admin/stores/{sid}/menu/{code}")
def admin_remove_menu(sid: str, code: str, user: dict = Depends(auth.require_store_access)):
    if stores.is_builtin(sid):
        raise HTTPException(400, "Cửa hàng dựng sẵn — menu chỉ đọc trong demo")
    stores.remove_menu_item(sid, code)
    return {"ok": True}


@router.get("/product-images")
def product_images(store_id: str):
    """Map mã sản phẩm -> ảnh của 1 cửa hàng — cho hệ thống ngoài (vd admin BQ) hiện ảnh
    trong chi tiết đơn mà không cần kéo cả catalog đầy đủ (có thể tới 600+ mẫu)."""
    return {code: p.get("image") for code, p in stores.products(store_id).items()}


@router.get("/orders")
def list_orders(store_id: str, user: dict = Depends(auth.require_store_access_qs)):
    """Đơn của 1 cửa hàng — dùng cho console xem nhanh (chưa phải trang admin đầy đủ)."""
    return store.list_orders(store_id)


@router.get("/orders/{oid}")
def get_order(oid: str, store_id: str, user: dict = Depends(auth.require_store_access_qs)):
    o = store.get_order(oid, store_id)
    if not o:
        raise HTTPException(404, "Đơn không tồn tại")
    return o


class StatusBody(BaseModel):
    status: str


@router.post("/orders/{oid}/status")
def set_order_status(oid: str, body: StatusBody, user: dict = Depends(auth.require_order_access)):
    """Đặt thẳng 1 trạng thái bất kỳ (dùng cho console/admin riêng khi cần ghi đè)."""
    o = store.set_status(oid, body.status)
    if not o:
        raise HTTPException(404, "Đơn không tồn tại")
    return o


# Vòng đời đơn khách đặt qua bot — đơn giản hơn đơn sỉ (không có bước duyệt hạn mức).
RETAIL_LIFECYCLE = ["Chờ xác nhận", "Đang đóng gói", "Đang giao", "Hoàn tất"]


class ActorBody(BaseModel):
    actor: str = "Quản lý bán hàng"


@router.post("/orders/{oid}/advance")
def advance_order(oid: str, body: ActorBody, user: dict = Depends(auth.require_order_access)):
    """Đẩy đơn sang trạng thái kế tiếp trong vòng đời — nguồn logic DUY NHẤT cho vòng
    đời đơn lẻ, để mọi admin (BQ, console riêng của commerce...) gọi chung, không tự
    suy luận trạng thái kế tiếp ở từng nơi."""
    o = store.get_order(oid)
    if not o:
        raise HTTPException(404, "Đơn không tồn tại")
    cur = o["status"]
    if cur not in RETAIL_LIFECYCLE:
        raise HTTPException(400, f"Không thể đẩy đơn ở trạng thái '{cur}'")
    idx = RETAIL_LIFECYCLE.index(cur)
    if idx >= len(RETAIL_LIFECYCLE) - 1:
        raise HTTPException(400, "Đơn đã ở trạng thái cuối")
    return store.set_status(oid, RETAIL_LIFECYCLE[idx + 1])


@router.post("/orders/{oid}/cancel")
def cancel_order(oid: str, body: ActorBody, user: dict = Depends(auth.require_order_access)):
    o = store.get_order(oid)
    if not o:
        raise HTTPException(404, "Đơn không tồn tại")
    return store.set_status(oid, "Đã huỷ")


app.include_router(router)

# 2 "cổng" (console) dùng CHUNG 1 bundle React (build tại commerce/admin ->
# commerce/static/admin) — /admin/* cho super admin, /portal/* cho chủ cửa hàng tự
# cấu hình (xem admin/src/lib/console.js). KHÔNG mount thêm /portal/assets — index.html
# build sẵn tham chiếu asset bằng đường dẫn TUYỆT ĐỐI "/admin/assets/..." (vite base
# "/admin/"), nên dù trang HTML được trả về từ /portal/* thì trình duyệt vẫn tải đúng
# JS/CSS qua mount /admin/assets có sẵn — chỉ cần serve nguyên văn index.html ở cả 2
# tiền tố, React Router (basename tự nhận theo tiền tố) lo phần còn lại.
_ADMIN_DIST = os.path.join(STATIC_DIR, "admin")
if os.path.isdir(_ADMIN_DIST):
    app.mount("/admin/assets", StaticFiles(directory=os.path.join(_ADMIN_DIST, "assets")), name="admin-assets")

    @app.get("/admin")
    @app.get("/admin/{full_path:path}")
    @app.get("/portal")
    @app.get("/portal/{full_path:path}")
    async def admin_spa(full_path: str = ""):
        return FileResponse(os.path.join(_ADMIN_DIST, "index.html"))
