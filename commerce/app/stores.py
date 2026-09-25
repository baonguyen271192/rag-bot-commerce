"""Registry TENANT (đa cửa hàng) — nền multi-tenant của Commerce.

Mỗi 'store' là một cửa hàng độc lập: Fanpage riêng (page_id + token), catalog
riêng, tone/chính sách riêng. Mọi đơn hàng gắn `store_id` (xem store.py) và mọi
truy vấn lọc theo nó → các shop cách ly hoàn toàn.

[1a — DB hoá] Ruột đã chuyển từ dict RAM sang `repository.py` (SQLite, 1 file
`COMMERCE_DB_PATH`) + cache RAM (mục "Cache store trong RAM" dưới đây) để tránh
JOIN lại products/channels mỗi lần `get()` được gọi — `engine.py` gọi
`get()`/`products()`/`categories()` NHIỀU LẦN cho MỖI tin nhắn khách. GIỮ NGUYÊN
mọi chữ ký hàm public + fallback "default" hiện có ở lượt này (bỏ fallback là
việc của lượt 1b, xem `.bangiao/ke-hoach.md`, KHÔNG làm ở đây).
"""

from __future__ import annotations

import re

from . import business_types, repository

# Giữ 2 hằng số này cho `_seed_stores()` (migrate_to_db.py — ghi thẳng qua repository,
# KHÔNG qua create_store() bên dưới nên không đụng registry business_types) — không phải
# nguồn mặc định cho store mới tạo qua admin nữa, xem `business_types.py`.
_DEFAULT_RETAIL_POLICIES = {
    "van_chuyen": ("Giao hàng toàn quốc. Nội thành 1–2 ngày, tỉnh 2–4 ngày. Phí ship tính khi "
                   "chốt đơn theo địa chỉ; đơn từ 2 đôi thường được freeship (tuỳ chương trình)."),
    "thanh_toan": ("Khách thanh toán **COD** (trả tiền khi nhận) hoặc **chuyển khoản** trước."),
    "doi_tra": ("Đổi trong 7 ngày nếu hàng còn mới, chưa qua sử dụng, còn hộp và tem. "
                "Lỗi từ nhà sản xuất được đổi/hoàn miễn phí."),
}

_CHAO_POLICIES = {
    "van_chuyen": ("Quán giao tận nơi nội thành Đà Nẵng. Đơn thường giao trong 20–40 phút tuỳ khu vực. "
                   "Phí ship tính theo khoảng cách khi chốt đơn."),
    "thanh_toan": "Thanh toán **tiền mặt khi nhận (COD)** hoặc **chuyển khoản**.",
    "doi_tra": ("Nếu món có vấn đề (nguội, sai món), anh/chị báo ngay trong 30 phút để quán đổi/hoàn nhé. "
                "Quán mở cửa **6:00–22:00** mỗi ngày."),
}

DEFAULT_STORE_ID = "default"

# Đa kênh: 1 kênh/loại/store (channels là dict keyed theo loại kênh, KHÔNG phải list
# nhiều tài khoản cùng loại).
CHANNEL_TYPES = ("facebook", "zalo_oa", "zalo_personal")

# external-id field dùng để route tin về đúng store cho từng loại kênh có route được
# (zalo_personal không cần external id — sidecar tự gửi kèm store_id).
_EXTERNAL_ID_FIELD = {"facebook": "page_id", "zalo_oa": "oa_id"}

# Shape "rỗng" của 1 channel CHƯA cấu hình — khớp nguyên `_build_channels_from_flat()`
# bản cũ, để mọi store LUÔN có đủ cả 3 khoá channels.facebook/zalo_oa/zalo_personal dù
# chưa từng ghi gì vào DB (repository chỉ lưu row cho channel đã cấu hình it nhất 1 lần).
_EMPTY_CHANNEL_CFG = {
    "facebook": {"enabled": False, "page_id": "", "page_token": ""},
    # [Chưa xác minh tên field] Chưa có tài liệu Zalo OA chính thức — placeholder trống.
    "zalo_oa": {"enabled": False, "app_id": "", "app_secret": "", "oa_id": "",
                "oa_access_token": "", "oa_refresh_token": "", "token_expires_at": ""},
    "zalo_personal": {"enabled": False},
}


# ==================== [1a] Cache store trong RAM ====================
# Vấn đề: mỗi tin nhắn khách gọi get()/products()/categories() NHIỀU lần cho CÙNG 1
# store (xem "Đối chiếu code thật" #10 trong kế hoạch) — không cache thì mỗi lần đó là
# 1 JOIN products/channels riêng, nổ nhiều query lặp lại mỗi tin nhắn.
#
# Cache "dict shape đầy đủ" (đã join products+categories+channels+field phẳng FB) theo
# store_id — chính là SẢN PHẨM của _build_store_dict()/get(), không phải cache SQL thô.
# Đặt ở đây (không phải repository.py) vì repository là lớp SQL thuần, vô trạng thái;
# cache đúng cấp trừu tượng caller (engine/assistant) đang dùng là ở đây.
#
# Lưu ý mutation: caller (engine/assistant) chỉ ĐỌC dict trả về (đã rà code — không có
# gán `p[...] = ` lên product lấy từ stores.products()/get(), chỉ có cart item TỰ COPY
# riêng mới bị sửa), nên chia sẻ tham chiếu (không copy) là an toàn.
#
# Đa tiến trình: cache RAM theo TỪNG worker uvicorn. Chạy 1 worker (mặc định dev) thì
# đủ; nhiều worker thì cache/invalidate không lan sang worker khác -> [Unverified, dựa
# quan sát mã nguồn] có thể đọc thấy dữ liệu cũ ở worker khác cho tới khi worker đó tự
# miss cache. Quy mô hiện tại (vài khách/1 worker) coi là chấp nhận được; multi-worker
# để lượt sau.
_CACHE: dict[str, dict] = {}


def _invalidate(store_id: str) -> None:
    _CACHE.pop(store_id, None)


def _invalidate_all() -> None:
    _CACHE.clear()


def _build_store_dict(store_id: str) -> dict | None:
    """Dựng dict CÙNG SHAPE bản RAM cũ cho 1 store — None nếu store không tồn tại."""
    row = repository.get_store_row(store_id)
    if not row:
        return None
    products = {p["code"]: p for p in repository.list_products(store_id)}
    categories = repository.list_categories(store_id)
    channels = {ch["platform"]: {k: v for k, v in ch.items() if k != "platform"}
                for ch in repository.list_channels(store_id)}
    for ctype in CHANNEL_TYPES:
        channels.setdefault(ctype, dict(_EMPTY_CHANNEL_CFG[ctype]))
    fb = channels.get("facebook", {})
    return {
        **row,
        "products": products,
        "categories": categories,
        "channels": channels,
        # Field phẳng FB (câu 6/9 cũ) — GIỮ để messenger.py/_store_summary cũ không vỡ;
        # nguồn sự thật giờ là `channels.facebook`, đây chỉ là phái sinh đọc-được.
        "fb_page_id": fb.get("page_id", ""),
        "fb_page_token": fb.get("page_token", ""),
    }


def _get_cached(sid: str) -> dict | None:
    """Trả dict store CHÍNH XÁC theo `sid` (KHÔNG fallback sang default nếu không thấy)
    — dùng cho những hàm mà bản cũ KHÔNG fallback khi store lạ (channels_of/
    channel_config), khác với get() (CÓ fallback). Có cache."""
    if sid in _CACHE:
        return _CACHE[sid]
    st = _build_store_dict(sid)
    if st is None:
        return None
    _CACHE[sid] = st
    return st


def get(store_id: str | None) -> dict:
    """Trả store theo id; None/không thấy → store default (giữ tương thích ngược,
    y hệt `_STORES.get(store_id or DEFAULT_STORE_ID, _STORES[DEFAULT_STORE_ID])` cũ).
    **[1a] GIỮ fallback "default" — bỏ fallback là việc của lượt 1b.**"""
    sid = store_id or DEFAULT_STORE_ID
    st = _get_cached(sid)
    if st is not None:
        return st
    if sid != DEFAULT_STORE_ID:
        st = _get_cached(DEFAULT_STORE_ID)
        if st is not None:
            return st
    return {}


def exists(store_id: str) -> bool:
    return repository.store_exists(store_id)


def channels_of(store_id: str | None) -> dict:
    """Dict `channels` của store (rỗng nếu store không tồn tại/chưa cấu hình).
    **[1a] GIỮ nguyên `store_id or DEFAULT_STORE_ID`** — KHÔNG fallback sang store
    default khi `store_id` lạ (khác `get()`), y hệt hành vi cũ."""
    st = _get_cached(store_id or DEFAULT_STORE_ID)
    return (st or {}).get("channels", {})


def channel_config(store_id: str | None, channel_type: str) -> dict | None:
    """Cấu hình 1 kênh; None nếu store hoặc kênh không tồn tại. **[1a] GIỮ nguyên
    `store_id or DEFAULT_STORE_ID`**, không fallback sang default khi store lạ."""
    st = _get_cached(store_id or DEFAULT_STORE_ID)
    if not st:
        return None
    return (st.get("channels") or {}).get(channel_type)


def by_channel(channel_type: str, external_id: str) -> dict | None:
    """Route: tra store theo external id của 1 loại kênh (facebook→page_id,
    zalo_oa→oa_id [Chưa xác minh]). Bỏ qua kênh enabled=false. None nếu không khớp
    hoặc channel_type không route được (zalo_personal route qua store_id, không qua
    external id)."""
    if channel_type not in _EXTERNAL_ID_FIELD or not external_id:
        return None
    sid = repository.find_store_by_external_id(channel_type, external_id, only_enabled=True)
    if not sid:
        return None
    return get(sid)


def by_page_id(page_id: str) -> dict | None:
    """Tra store theo Facebook Page ID (route webhook đa Fanpage). Giữ nguyên chữ ký
    (đang dùng ở main.py webhook FB)."""
    return by_channel("facebook", page_id)


def set_channel(store_id: str, channel_type: str, cfg: dict) -> dict:
    """Upsert 1 kênh (merge vào cấu hình cũ, không xoá field không truyền). Validate:
    channel_type phải hợp lệ, store phải tồn tại, external_id (nếu có) không được đụng
    store khác (routing phải đơn trị) — mọi vi phạm raise ValueError."""
    if channel_type not in CHANNEL_TYPES:
        raise ValueError(f"Loại kênh không hợp lệ: {channel_type}")
    if not repository.store_exists(store_id):
        raise ValueError("Cửa hàng không tồn tại")
    id_field = _EXTERNAL_ID_FIELD.get(channel_type)
    if id_field:
        external_id = cfg.get(id_field, "")
        if external_id:
            owner = repository.external_id_owner(
                channel_type, external_id, exclude_store_id=store_id)
            if owner:
                raise ValueError(
                    f"{id_field} '{external_id}' đã được cửa hàng khác ({owner}) dùng")
    repository.upsert_channel(store_id, channel_type, cfg)
    _invalidate(store_id)
    return get(store_id)


def remove_channel(store_id: str, channel_type: str) -> None:
    """Xoá cấu hình 1 kênh."""
    if not repository.store_exists(store_id):
        return
    repository.delete_channel(store_id, channel_type)
    _invalidate(store_id)


def channel_connected(store_id: str | None, channel_type: str) -> bool:
    """Suy ra 'đã kết nối' theo điều kiện đủ credentials từng loại kênh."""
    cfg = channel_config(store_id, channel_type)
    if not cfg or not cfg.get("enabled"):
        return False
    if channel_type == "facebook":
        return bool(cfg.get("page_id") and cfg.get("page_token"))
    if channel_type == "zalo_oa":
        # [Chưa xác minh điều kiện đủ] tạm coi có oa_id + access token là đủ.
        return bool(cfg.get("oa_id") and cfg.get("oa_access_token"))
    if channel_type == "zalo_personal":
        # Trạng thái login THẬT lấy live từ sidecar (không lưu ở commerce) — ở đây chỉ
        # suy ra "đã bật kênh", không phải "đã đăng nhập Zalo thành công".
        return bool(cfg.get("enabled"))
    return False


def zalo_enabled(store_id: str | None) -> bool:
    """`zalo_enabled` phái sinh từ `channels.zalo_personal.enabled` — sidecar
    commerce/zalo-bridge/ đọc field này (qua GET /api/admin/stores) để discover tenant."""
    return bool((channel_config(store_id, "zalo_personal") or {}).get("enabled", False))


def all_stores() -> list[dict]:
    return [get(row["id"]) for row in repository.list_store_rows()]


def products(store_id: str | None) -> dict:
    return get(store_id)["products"]


def categories(store_id: str | None) -> list:
    return get(store_id)["categories"]


# ================== Quản lý Bot: tạo/sửa/xoá cửa hàng (qua DB) ==================
# Store dựng sẵn (default/shop2/chao) là SEED (builtin=1 trong DB), không xoá. Store
# người dùng tạo qua console (POST /api/admin/stores) ghi vào DB (builtin=0) để không
# mất khi restart — thay cho `stores_config.json` cũ (đã migrate, xem
# `app/scripts/migrate_to_db.py`).

_TENANT_ID = "tenant-main"


def is_builtin(store_id: str) -> bool:
    row = repository.get_store_row(store_id)
    return bool(row and row.get("builtin"))


def _menu_item(code: str, name: str, category: str, price: int, sizes: dict | None = None) -> dict:
    return {"code": code.upper(), "name": name, "category": category or "Khác",
            "retail": int(price), "wholesale": int(price),
            "sizes": sizes or {}, "image": "", "images": []}


# Chữ thường, số, gạch ngang — id này còn được dùng làm khoá phiên hội thoại
# (`store_id:channel:sender_id`) và tên thư mục dữ liệu của zalo-bridge; trước đây UI chỉ
# GHI CHÚ yêu cầu này chứ không chặn, gõ dấu/hoa/khoảng trắng vẫn tạo được store.
_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,63}$")


def _validate_store_id(sid: str) -> None:
    if not _ID_RE.match(sid):
        raise ValueError(
            "Mã cửa hàng chỉ được dùng chữ thường a-z, số 0-9 và dấu gạch ngang, "
            "bắt đầu bằng chữ hoặc số, dài 2-64 ký tự (vd: chao-o-hoen)")


def _validate_variant_config(variant_mode: str, variant_min: int, variant_max: int,
                              variant_labels: list) -> None:
    """Chặn tạo/sửa ra 1 cửa hàng 'chết' về mặt biến thể — trước đây không kiểm tra gì,
    để trống nhãn hoặc gõ min > max vẫn lưu được, khiến bot KHÔNG BAO GIỜ nhận diện được
    size/nhãn khách gõ (mọi tin nhắn có size đều rơi vào 'không hiểu') mà không có cảnh
    báo nào tại thời điểm tạo — chỉ lộ ra khi khách thật gặp phải."""
    if variant_mode == "nhan" and not (variant_labels or []):
        raise ValueError(
            "Kiểu biến thể 'danh sách nhãn tự đặt' cần ít nhất 1 nhãn (vd S, M, L)")
    if variant_mode == "so" and int(variant_min) > int(variant_max):
        raise ValueError("Số nhỏ nhất phải nhỏ hơn hoặc bằng số lớn nhất")


def create_store(cfg: dict) -> dict:
    sid = (cfg.get("id") or "").strip().lower()
    if not sid or repository.store_exists(sid):
        raise ValueError("Mã cửa hàng trống hoặc đã tồn tại")
    _validate_store_id(sid)
    # Chặn trùng page_id với store khác NGAY khi tạo — không chỉ qua set_channel.
    fb_page_id = cfg.get("fb_page_id", "")
    if fb_page_id and repository.external_id_owner("facebook", fb_page_id):
        raise ValueError(f"page_id '{fb_page_id}' đã được cửa hàng khác dùng")
    biz_key = cfg.get("business_type") or business_types.DEFAULT_BUSINESS_TYPE
    biz = business_types.get(biz_key)
    # variant_mode: 'so' (dải số, vd size giày) | 'nhan' (danh sách nhãn tự đặt, vd S/M/L)
    # | 'khong_co' (không có biến thể — chỉ số lượng, như quán ăn). Mặc định LẤY THEO
    # NGÀNH đã chọn (registry business_types.py) thay vì suy từ business_type=='food' như
    # trước — giờ hỗ trợ nhiều ngành hơn 2, suy kiểu cũ sẽ sai với ngành mới.
    variant_mode = cfg.get("variant_mode") or biz["variant_mode"]
    variant_min = int(cfg.get("variant_min") or biz.get("variant_min", 24))
    variant_max = int(cfg.get("variant_max") or biz.get("variant_max", 46))
    # CHỦ Ý dùng "có gửi key hay không" (không dùng `or`) — nếu dùng `or`, khách gửi
    # variant_labels=[] một cách CÓ CHỦ ĐÍCH (form tạo cửa hàng LUÔN gửi field này, kể cả
    # rỗng khi admin xoá trắng ô nhãn) sẽ bị âm thầm thay bằng nhãn mặc định của ngành —
    # che mất đúng lỗi mà `_validate_variant_config` bên dưới cần bắt được (nhãn rỗng dù
    # chọn kiểu 'nhan'). Chỉ dùng nhãn mặc định của ngành khi caller KHÔNG gửi field này.
    variant_labels = cfg["variant_labels"] if "variant_labels" in cfg else biz.get("variant_labels", [])
    _validate_variant_config(variant_mode, variant_min, variant_max, variant_labels)
    has_size = bool(cfg.get("has_size", variant_mode != "khong_co"))
    row = {
        "id": sid, "tenant_id": _TENANT_ID, "name": cfg.get("name", sid),
        "shop_label": cfg.get("shop_label") or cfg.get("name", sid),
        "business_type": biz_key,
        "unit": cfg.get("unit") or biz.get("unit", "cái"),
        "has_size": has_size,
        "variant_mode": variant_mode,
        "variant_min": variant_min,
        "variant_max": variant_max,
        "variant_labels": variant_labels,
        "tone": cfg.get("tone", "warm"),
        "custom_prompt": cfg.get("custom_prompt", ""),
        # Chính sách mặc định LẤY THEO NGÀNH (registry) — trước đây MỌI store ngành "food"
        # bị gán cứng nguyên văn chính sách của quán demo "chao" (kể cả câu "giao tận nội
        # thành Đà Nẵng"), sai địa điểm/thời gian cho bất kỳ quán ăn nào khác thành phố.
        "policies_json": cfg.get("policies") or biz.get("policies", {}),
        "status": "active", "builtin": 0,
    }
    repository.create_store_row(row)
    fb_page_token = cfg.get("fb_page_token", "")
    if fb_page_id or fb_page_token:
        repository.upsert_channel(sid, "facebook", {
            "enabled": bool(fb_page_id and fb_page_token),
            "page_id": fb_page_id, "page_token": fb_page_token,
        })
    _invalidate(sid)
    return get(sid)


_EDITABLE = ("name", "shop_label", "business_type", "unit", "has_size",
             "variant_mode", "variant_min", "variant_max", "variant_labels",
             "tone", "status", "custom_prompt")


def update_store(store_id: str, patch: dict) -> dict:
    if not repository.store_exists(store_id):
        raise ValueError("Cửa hàng không tồn tại")
    provided = {k: v for k, v in patch.items() if v is not None}
    # Chặn trùng page_id với store khác TRƯỚC khi ghi đè.
    if "fb_page_id" in provided and provided["fb_page_id"]:
        owner = repository.external_id_owner(
            "facebook", provided["fb_page_id"], exclude_store_id=store_id)
        if owner:
            raise ValueError(
                f"page_id '{provided['fb_page_id']}' đã được cửa hàng khác ({owner}) dùng")
    if any(k in provided for k in ("variant_mode", "variant_min", "variant_max", "variant_labels")):
        current = repository.get_store_row(store_id) or {}
        _validate_variant_config(
            provided.get("variant_mode", current.get("variant_mode", "khong_co")),
            provided.get("variant_min", current.get("variant_min", 24)),
            provided.get("variant_max", current.get("variant_max", 46)),
            provided.get("variant_labels", current.get("variant_labels", [])),
        )
    row_patch = {k: v for k, v in provided.items() if k in _EDITABLE}
    if row_patch:
        repository.update_store_row(store_id, row_patch)
    if "fb_page_id" in provided or "fb_page_token" in provided:
        # Đồng bộ channels.facebook — `channels` là nguồn sự thật, field phẳng
        # fb_page_id/fb_page_token (giữ lại để tương thích ngược) chỉ là phái sinh.
        cur_fb = repository.get_channel(store_id, "facebook") or {}
        page_id = provided.get("fb_page_id", cur_fb.get("page_id", ""))
        page_token = provided.get("fb_page_token", cur_fb.get("page_token", ""))
        repository.upsert_channel(store_id, "facebook", {
            "enabled": bool(page_id and page_token),
            "page_id": page_id, "page_token": page_token,
        })
    if "policies" in provided and isinstance(provided["policies"], dict):
        cur_policies = (repository.get_store_row(store_id) or {}).get("policies", {})
        repository.update_store_row(
            store_id, {"policies_json": {**cur_policies, **provided["policies"]}})
    _invalidate(store_id)
    return get(store_id)


def delete_store(store_id: str) -> None:
    if is_builtin(store_id):
        raise ValueError("Không thể xoá cửa hàng dựng sẵn")
    repository.delete_store_row(store_id)
    _invalidate(store_id)


def add_menu_item(store_id: str, item: dict) -> dict:
    if not repository.store_exists(store_id):
        raise ValueError("Cửa hàng không tồn tại")
    sizes = item.get("sizes") or {}
    mi = _menu_item(item["code"], item["name"], item.get("category", ""), item["price"], sizes)
    repository.upsert_product(store_id, mi)
    _invalidate(store_id)
    return mi


def remove_menu_item(store_id: str, code: str) -> None:
    if not repository.store_exists(store_id):
        return
    repository.delete_product(store_id, code.upper())
    _invalidate(store_id)
