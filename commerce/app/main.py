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

from fastapi import APIRouter, FastAPI, HTTPException, Request, Response
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
from . import business_types, engine, messenger, store, stores, zalo_adapter, zalo_oa  # noqa: F401

app = FastAPI(title="Commerce — Bot đặt đơn đa cửa hàng")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

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
        # entry.id = Page ID nhận tin → tra ra cửa hàng (đa Fanpage). Không thấy → store default.
        st = stores.by_page_id(entry.get("id", ""))
        store_id = st["id"] if st else "default"
        token = st["fb_page_token"] if st else None
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


# ==================== Quản lý Bot (console) ====================

router = APIRouter(prefix="/api")


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
def admin_business_types():
    """Danh sách ngành hàng hỗ trợ sẵn (nhãn + mặc định biến thể/đơn vị) — admin UI vẽ
    theo danh sách này thay vì hardcode 2 lựa chọn cố định, để thêm 1 ngành mới chỉ cần
    sửa `business_types.py`, không cần đổi/build lại phần chọn ngành trên React."""
    return business_types.list_types()


@router.get("/admin/stores")
def admin_list_stores():
    return [_store_summary(s) for s in stores.all_stores()]


@router.get("/admin/stores/{sid}")
def admin_store_detail(sid: str):
    if not stores.exists(sid):
        raise HTTPException(404, "Cửa hàng không tồn tại")
    st = stores.get(sid)
    return {**_store_summary(st), "policies": st.get("policies", {}),
            "categories": st.get("categories", []), "menu": list(st.get("products", {}).values())}


class StoreCreate(BaseModel):
    id: str
    name: str
    business_type: str = "food"     # 'shoe' | 'food'
    has_size: Optional[bool] = None
    variant_mode: Optional[str] = None   # 'so' | 'nhan' | 'khong_co'
    variant_min: int = 24
    variant_max: int = 46
    variant_labels: List[str] = []
    fb_page_id: str = ""
    fb_page_token: str = ""
    tone: str = "warm"
    custom_prompt: str = ""


@router.post("/admin/stores")
def admin_create_store(body: StoreCreate):
    try:
        st = stores.create_store(body.dict())
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
def admin_update_store(sid: str, body: StoreUpdate):
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
def admin_delete_store(sid: str):
    try:
        stores.delete_store(sid)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


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
def admin_get_channels(sid: str):
    if not stores.exists(sid):
        raise HTTPException(404, "Cửa hàng không tồn tại")
    return {ctype: _channel_public(ctype, stores.channel_config(sid, ctype) or {})
            for ctype in stores.CHANNEL_TYPES}


@router.put("/admin/stores/{sid}/channels/{ctype}")
def admin_set_channel(sid: str, ctype: str, body: ChannelConfigBody):
    if not stores.exists(sid):
        raise HTTPException(404, "Cửa hàng không tồn tại")
    if ctype not in stores.CHANNEL_TYPES:
        raise HTTPException(400, "Loại kênh không hợp lệ")
    try:
        stores.set_channel(sid, ctype, body.dict(exclude_none=True))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return _store_summary(stores.get(sid))


@router.delete("/admin/stores/{sid}/channels/{ctype}")
def admin_remove_channel(sid: str, ctype: str):
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
    sizes: Optional[Dict[str, int]] = None


@router.post("/admin/stores/{sid}/menu")
def admin_add_menu(sid: str, body: MenuItemBody):
    if not stores.exists(sid):
        raise HTTPException(404, "Cửa hàng không tồn tại")
    if stores.is_builtin(sid):
        raise HTTPException(400, "Cửa hàng dựng sẵn — menu chỉ đọc trong demo")
    return stores.add_menu_item(sid, body.dict())


@router.delete("/admin/stores/{sid}/menu/{code}")
def admin_remove_menu(sid: str, code: str):
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
def list_orders(store_id: str):
    """Đơn của 1 cửa hàng — dùng cho console xem nhanh (chưa phải trang admin đầy đủ)."""
    return store.list_orders(store_id)


@router.get("/orders/{oid}")
def get_order(oid: str, store_id: str):
    o = store.get_order(oid, store_id)
    if not o:
        raise HTTPException(404, "Đơn không tồn tại")
    return o


class StatusBody(BaseModel):
    status: str


@router.post("/orders/{oid}/status")
def set_order_status(oid: str, body: StatusBody):
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
def advance_order(oid: str, body: ActorBody):
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
def cancel_order(oid: str, body: ActorBody):
    o = store.get_order(oid)
    if not o:
        raise HTTPException(404, "Đơn không tồn tại")
    return store.set_status(oid, "Đã huỷ")


app.include_router(router)

# Admin UI (React SPA, build tại commerce/admin -> commerce/static/admin). Chỉ mount
# assets tĩnh; mọi path /admin/* khác đều trả về index.html để React Router tự xử lý
# (kể cả khi user refresh/mở trực tiếp 1 link con như /admin/stores/default).
_ADMIN_DIST = os.path.join(STATIC_DIR, "admin")
if os.path.isdir(_ADMIN_DIST):
    app.mount("/admin/assets", StaticFiles(directory=os.path.join(_ADMIN_DIST, "assets")), name="admin-assets")

    @app.get("/admin")
    @app.get("/admin/{full_path:path}")
    async def admin_spa(full_path: str = ""):
        return FileResponse(os.path.join(_ADMIN_DIST, "index.html"))
