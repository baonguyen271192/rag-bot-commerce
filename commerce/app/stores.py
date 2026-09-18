"""Registry TENANT (đa cửa hàng) — nền multi-tenant của Commerce.

Mỗi 'store' là một cửa hàng độc lập: Fanpage riêng (page_id + token), catalog
riêng, tone/chính sách riêng. Mọi đơn hàng gắn `store_id` (xem store.py) và mọi
truy vấn lọc theo nó → các shop cách ly hoàn toàn.

Hiện tại catalog để trong bộ nhớ (từ data.py) cho demo; khi lên production thay
bằng bảng DB `stores` + `products(store_id)` là chạy được ngay, giữ interface.
"""

from __future__ import annotations

import json
import os

from . import data

_DEFAULT_RETAIL_POLICIES = {
    "van_chuyen": ("Giao hàng toàn quốc. Nội thành 1–2 ngày, tỉnh 2–4 ngày. Phí ship tính khi "
                   "chốt đơn theo địa chỉ; đơn từ 2 đôi thường được freeship (tuỳ chương trình)."),
    "thanh_toan": ("Khách thanh toán **COD** (trả tiền khi nhận) hoặc **chuyển khoản** trước."),
    "doi_tra": ("Đổi trong 7 ngày nếu hàng còn mới, chưa qua sử dụng, còn hộp và tem. "
                "Lỗi từ nhà sản xuất được đổi/hoàn miễn phí."),
}

# Catalog cho store demo thứ 2 = CHỈ giày nam (để nhìn rõ khác biệt khi demo).
_SHOP2_PRODUCTS = {c: p for c, p in data.PRODUCTS.items() if p["category"] == "Giày Nam"}
_SHOP2_CATEGORIES = sorted({p["category"] for p in _SHOP2_PRODUCTS.values()})

DEFAULT_STORE_ID = "default"

# Đa kênh (Phần A kế hoạch multi-tenant): 1 kênh/loại/store (câu 1, phương án A —
# channels là dict keyed theo loại kênh, KHÔNG phải list nhiều tài khoản cùng loại).
CHANNEL_TYPES = ("facebook", "zalo_oa", "zalo_personal")

# external-id field dùng để route tin về đúng store cho từng loại kênh có route được
# (zalo_personal không cần external id — sidecar tự gửi kèm store_id, xem zalo-bridge/).
_EXTERNAL_ID_FIELD = {"facebook": "page_id", "zalo_oa": "oa_id"}


def _build_channels_from_flat(st: dict) -> dict:
    """(Migration câu 1/9) Dựng `channels` từ field phẳng cũ (`fb_page_id`/`fb_page_token`,
    `zalo_enabled`) cho store CHƯA có `channels`. Sau khi dựng, `channels` là NGUỒN SỰ
    THẬT; field phẳng chỉ còn là thuộc tính phái sinh đọc-được (đồng bộ ở update_store()/
    _persist() để messenger.py/sidecar cũ không vỡ)."""
    page_id, page_token = st.get("fb_page_id", ""), st.get("fb_page_token", "")
    return {
        "facebook": {"enabled": bool(page_id and page_token),
                     "page_id": page_id, "page_token": page_token},
        # [Chưa xác minh tên field — câu 3] Chưa có tài liệu Zalo OA chính thức, để
        # placeholder trống; KHÔNG bịa field. Xem CÂU HỎI CÒN BỎ NGỎ #3 trong kế hoạch.
        "zalo_oa": {"enabled": False, "app_id": "", "app_secret": "", "oa_id": "",
                    "oa_access_token": "", "oa_refresh_token": "", "token_expires_at": ""},
        "zalo_personal": {"enabled": bool(st.get("zalo_enabled", False))},
    }


def _store_owning_external_id(channel_type: str, external_id: str,
                               exclude_store_id: str | None = None) -> dict | None:
    """Store khác (không phải exclude_store_id) đang khai external_id này ở channel_type —
    dùng để chặn trùng (câu 6), quét CẢ kênh disabled (routing phải đơn trị dù chưa bật)."""
    id_field = _EXTERNAL_ID_FIELD.get(channel_type)
    if not id_field or not external_id:
        return None
    for sid, st in _STORES.items():
        if sid == exclude_store_id:
            continue
        cfg = (st.get("channels") or {}).get(channel_type) or {}
        if cfg.get(id_field) == external_id:
            return st
    return None


def _dish(code, name, cat, price):
    # 'sizes' để rỗng vì quán ăn KHÔNG có size (đặt theo phần). Giữ khoá cho đồng nhất schema.
    return {"code": code, "name": name, "category": cat, "retail": price, "wholesale": price,
            "sizes": {}, "image": "", "images": []}


# Menu quán cháo — dữ liệu THẬT về loại món (cào từ web/FB); GIÁ là tham khảo (quán chưa công khai).
_CHAO_MENU = {d["code"]: d for d in [
    _dish("CHAO_NGHEU", "Cháo nghêu", "Cháo", 30000),
    _dish("CHAO_NGHEU_DB", "Cháo nghêu đặc biệt", "Cháo", 45000),
    _dish("CHAO_SUON", "Cháo sườn", "Cháo", 35000),
    _dish("CHAO_HAU", "Cháo hàu", "Cháo", 40000),
    _dish("CHAO_XUONG", "Cháo xương", "Cháo", 30000),
    _dish("CHAO_THAPCAM", "Cháo thập cẩm (nghêu + sườn + hàu)", "Cháo", 50000),
    _dish("TP_QUAY", "Quẩy", "Topping", 10000),
    _dish("TP_TRUNG", "Trứng", "Topping", 8000),
    _dish("TP_NGHEU", "Thêm nghêu", "Topping", 20000),
    _dish("NUOC_TRATAC", "Trà tắc", "Nước", 12000),
    _dish("NUOC_SUOI", "Nước suối", "Nước", 8000),
]}
_CHAO_POLICIES = {
    "van_chuyen": ("Quán giao tận nơi nội thành Đà Nẵng. Đơn thường giao trong 20–40 phút tuỳ khu vực. "
                   "Phí ship tính theo khoảng cách khi chốt đơn."),
    "thanh_toan": "Thanh toán **tiền mặt khi nhận (COD)** hoặc **chuyển khoản**.",
    "doi_tra": ("Nếu món có vấn đề (nguội, sai món), anh/chị báo ngay trong 30 phút để quán đổi/hoàn nhé. "
                "Quán mở cửa **6:00–22:00** mỗi ngày."),
}

# ---- Registry ----
_STORES: dict[str, dict] = {
    "default": {
        "id": "default",
        "name": "Giày BQ (demo)",
        "shop_label": "Shop Giày BQ",
        "business_type": "shoe",               # ngành giày: đặt theo SIZE, đơn vị 'đôi'
        "unit": "đôi",
        "has_size": True,
        "variant_mode": "so", "variant_min": 24, "variant_max": 46,  # dải size giày
        "fb_page_id": os.getenv("FB_PAGE_ID_DEFAULT", ""),
        "fb_page_token": os.getenv("PAGE_ACCESS_TOKEN_DEFAULT", ""),
        "tone": "warm",
        "products": data.PRODUCTS,
        "categories": data.CATEGORIES,
        "policies": _DEFAULT_RETAIL_POLICIES,
        "status": "active",
    },
    "shop2": {
        "id": "shop2",
        "name": "Giày Nam Phong Cách",
        "shop_label": "Shop Giày Nam Phong Cách",
        "business_type": "shoe",
        "unit": "đôi",
        "has_size": True,
        "variant_mode": "so", "variant_min": 24, "variant_max": 46,
        "fb_page_id": os.getenv("FB_PAGE_ID_SHOP2", ""),
        "fb_page_token": os.getenv("PAGE_ACCESS_TOKEN_SHOP2", ""),
        "tone": "warm",
        "products": _SHOP2_PRODUCTS,
        "categories": _SHOP2_CATEGORIES,
        "policies": _DEFAULT_RETAIL_POLICIES,
        "status": "active",
    },
    # Store NGÀNH KHÁC — quán ăn: đặt theo MÓN/PHẦN, không size. Chứng minh bot tái dùng đa ngành.
    "chao": {
        "id": "chao",
        "name": "Cháo Nghêu O Hoèn",
        "shop_label": "Cháo Nghêu O Hoèn",
        "business_type": "food",
        "unit": "phần",
        "has_size": False,
        "variant_mode": "khong_co",
        "fb_page_id": os.getenv("FB_PAGE_ID_CHAO", ""),
        "fb_page_token": os.getenv("PAGE_ACCESS_TOKEN_CHAO", ""),
        "tone": "warm",
        "products": _CHAO_MENU,
        "categories": ["Cháo", "Topping", "Nước"],
        "policies": _CHAO_POLICIES,
        "status": "active",
    },
}

# Seed store đọc token FB từ env (mỗi store env riêng, xem trên) — dựng `channels` từ
# đó ngay lúc import. zalo_enabled chưa có field env riêng cho seed nên mặc định False.
for _st in _STORES.values():
    _st["channels"] = _build_channels_from_flat(_st)


def get(store_id: str | None) -> dict:
    """Trả store theo id; None/không thấy → store default (giữ tương thích ngược)."""
    return _STORES.get(store_id or DEFAULT_STORE_ID, _STORES[DEFAULT_STORE_ID])


def exists(store_id: str) -> bool:
    return store_id in _STORES


def channels_of(store_id: str | None) -> dict:
    """Dict `channels` của store (rỗng nếu store không tồn tại/chưa cấu hình)."""
    st = _STORES.get(store_id or DEFAULT_STORE_ID)
    return (st or {}).get("channels", {})


def channel_config(store_id: str | None, channel_type: str) -> dict | None:
    """Cấu hình 1 kênh; None nếu store hoặc kênh không tồn tại."""
    st = _STORES.get(store_id or DEFAULT_STORE_ID)
    if not st:
        return None
    return (st.get("channels") or {}).get(channel_type)


def by_channel(channel_type: str, external_id: str) -> dict | None:
    """Route: tra store theo external id của 1 loại kênh (facebook→page_id,
    zalo_oa→oa_id [Chưa xác minh — câu 3]). Bỏ qua kênh enabled=false. None nếu không
    khớp hoặc channel_type không route được (zalo_personal route qua store_id, không
    qua external id — xem endpoint relay /channels/zalo/message)."""
    id_field = _EXTERNAL_ID_FIELD.get(channel_type)
    if not id_field or not external_id:
        return None
    for st in _STORES.values():
        cfg = (st.get("channels") or {}).get(channel_type) or {}
        if cfg.get("enabled") and cfg.get(id_field) == external_id:
            return st
    return None


def by_page_id(page_id: str) -> dict | None:
    """Tra store theo Facebook Page ID (route webhook đa Fanpage). Giữ nguyên chữ ký
    (đang dùng ở main.py webhook FB); ruột đổi thành route qua `channels.facebook`."""
    return by_channel("facebook", page_id)


def set_channel(store_id: str, channel_type: str, cfg: dict) -> dict:
    """Upsert 1 kênh (merge vào cấu hình cũ, không xoá field không truyền). Validate:
    channel_type phải hợp lệ, store phải tồn tại, external_id (nếu có) không được đụng
    store khác (câu 6 — routing phải đơn trị) — mọi vi phạm raise ValueError."""
    if channel_type not in CHANNEL_TYPES:
        raise ValueError(f"Loại kênh không hợp lệ: {channel_type}")
    st = _STORES.get(store_id)
    if not st:
        raise ValueError("Cửa hàng không tồn tại")
    id_field = _EXTERNAL_ID_FIELD.get(channel_type)
    if id_field:
        external_id = cfg.get(id_field, "")
        if external_id:
            owner = _store_owning_external_id(channel_type, external_id, exclude_store_id=store_id)
            if owner:
                raise ValueError(
                    f"{id_field} '{external_id}' đã được cửa hàng khác ({owner['id']}) dùng")
    channels = st.setdefault("channels", {})
    channels[channel_type] = {**channels.get(channel_type, {}), **cfg}
    if channel_type == "facebook":
        # Đồng bộ field phẳng cũ (nguồn sự thật giờ là `channels`) để messenger.py/
        # _store_summary cũ không vỡ.
        st["fb_page_id"] = channels["facebook"].get("page_id", "")
        st["fb_page_token"] = channels["facebook"].get("page_token", "")
    _persist()
    return st


def remove_channel(store_id: str, channel_type: str) -> None:
    """Xoá cấu hình 1 kênh."""
    st = _STORES.get(store_id)
    if not st:
        return
    (st.get("channels") or {}).pop(channel_type, None)
    if channel_type == "facebook":
        st["fb_page_id"] = ""
        st["fb_page_token"] = ""
    _persist()


def channel_connected(store_id: str | None, channel_type: str) -> bool:
    """Suy ra 'đã kết nối' theo điều kiện đủ credentials từng loại kênh."""
    cfg = channel_config(store_id, channel_type)
    if not cfg or not cfg.get("enabled"):
        return False
    if channel_type == "facebook":
        return bool(cfg.get("page_id") and cfg.get("page_token"))
    if channel_type == "zalo_oa":
        # [Chưa xác minh điều kiện đủ — câu 3] tạm coi có oa_id + access token là đủ.
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
    return list(_STORES.values())


def products(store_id: str | None) -> dict:
    return get(store_id)["products"]


def categories(store_id: str | None) -> list:
    return get(store_id)["categories"]


# ================== Quản lý Bot: tạo/sửa/xoá cửa hàng (persist JSON) ==================
# Store dựng sẵn (default/shop2/chao) là SEED, không xoá. Store người dùng tạo qua
# console (POST /api/admin/stores) được lưu vào stores_config.json để không mất khi restart.
_BUILTIN = {"default", "shop2", "chao"}
_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "stores_config.json")


def is_builtin(store_id: str) -> bool:
    return store_id in _BUILTIN


def _refresh_categories(st: dict) -> None:
    seen = []
    for p in st["products"].values():
        if p["category"] not in seen:
            seen.append(p["category"])
    st["categories"] = seen


def _menu_item(code: str, name: str, category: str, price: int, sizes: dict | None = None) -> dict:
    return {"code": code.upper(), "name": name, "category": category or "Khác",
            "retail": int(price), "wholesale": int(price),
            "sizes": sizes or {}, "image": "", "images": []}


def create_store(cfg: dict) -> dict:
    sid = (cfg.get("id") or "").strip().lower()
    if not sid or sid in _STORES:
        raise ValueError("Mã cửa hàng trống hoặc đã tồn tại")
    # Chặn trùng page_id với store khác NGAY khi tạo (câu 6) — không chỉ qua set_channel.
    fb_page_id = cfg.get("fb_page_id", "")
    if fb_page_id and _store_owning_external_id("facebook", fb_page_id):
        raise ValueError(f"page_id '{fb_page_id}' đã được cửa hàng khác dùng")
    is_food = cfg.get("business_type", "food") == "food"
    has_size = bool(cfg.get("has_size", not is_food))
    st = {
        "id": sid, "name": cfg.get("name", sid),
        "shop_label": cfg.get("shop_label") or cfg.get("name", sid),
        "business_type": cfg.get("business_type", "food"),
        "unit": cfg.get("unit") or ("phần" if is_food else "đôi"),
        "has_size": has_size,
        # variant_mode: 'so' (dải số, vd size giày) | 'nhan' (danh sách nhãn tự đặt,
        # vd S/M/L) | 'khong_co' (không có biến thể — chỉ số lượng, như quán ăn).
        "variant_mode": cfg.get("variant_mode") or ("so" if has_size else "khong_co"),
        "variant_min": int(cfg.get("variant_min", 24)),
        "variant_max": int(cfg.get("variant_max", 46)),
        "variant_labels": cfg.get("variant_labels") or [],
        "fb_page_id": cfg.get("fb_page_id", ""), "fb_page_token": cfg.get("fb_page_token", ""),
        "tone": cfg.get("tone", "warm"),
        "custom_prompt": cfg.get("custom_prompt", ""),
        "products": {}, "categories": [],
        "policies": cfg.get("policies") or (_CHAO_POLICIES if is_food else _DEFAULT_RETAIL_POLICIES),
        "status": "active",
    }
    st["channels"] = _build_channels_from_flat(st)
    _STORES[sid] = st
    _persist()
    return st


_EDITABLE = ("name", "shop_label", "business_type", "unit", "has_size",
             "variant_mode", "variant_min", "variant_max", "variant_labels",
             "fb_page_id", "fb_page_token", "tone", "status", "custom_prompt")


def update_store(store_id: str, patch: dict) -> dict:
    st = _STORES.get(store_id)
    if not st:
        raise ValueError("Cửa hàng không tồn tại")
    # Chặn trùng page_id với store khác (câu 6) TRƯỚC khi ghi đè.
    if "fb_page_id" in patch and patch["fb_page_id"]:
        owner = _store_owning_external_id("facebook", patch["fb_page_id"], exclude_store_id=store_id)
        if owner:
            raise ValueError(f"page_id '{patch['fb_page_id']}' đã được cửa hàng khác ({owner['id']}) dùng")
    for k in _EDITABLE:
        if k in patch and patch[k] is not None:
            st[k] = patch[k]
    if "fb_page_id" in patch or "fb_page_token" in patch:
        # Đồng bộ channels.facebook — `channels` là nguồn sự thật, field phẳng
        # fb_page_id/fb_page_token (giữ lại để tương thích ngược) chỉ là phái sinh.
        st.setdefault("channels", {})["facebook"] = {
            **(st.get("channels", {}).get("facebook") or {}),
            "enabled": bool(st.get("fb_page_id") and st.get("fb_page_token")),
            "page_id": st.get("fb_page_id", ""), "page_token": st.get("fb_page_token", ""),
        }
    if "policies" in patch and isinstance(patch["policies"], dict):
        st["policies"] = {**st.get("policies", {}), **patch["policies"]}
    _persist()
    return st


def delete_store(store_id: str) -> None:
    if store_id in _BUILTIN:
        raise ValueError("Không thể xoá cửa hàng dựng sẵn")
    _STORES.pop(store_id, None)
    _persist()


def add_menu_item(store_id: str, item: dict) -> dict:
    st = _STORES.get(store_id)
    if not st:
        raise ValueError("Cửa hàng không tồn tại")
    sizes = item.get("sizes") or {}
    mi = _menu_item(item["code"], item["name"], item.get("category", ""), item["price"], sizes)
    st["products"][mi["code"]] = mi
    _refresh_categories(st)
    _persist()
    return mi


def remove_menu_item(store_id: str, code: str) -> None:
    st = _STORES.get(store_id)
    if st:
        st["products"].pop(code.upper(), None)
        _refresh_categories(st)
        _persist()


def _persist() -> None:
    """Ghi các store NGƯỜI DÙNG tạo (không phải seed) ra JSON."""
    data_out = []
    for sid, st in _STORES.items():
        if sid in _BUILTIN:
            continue
        data_out.append({
            "id": st["id"], "name": st["name"], "shop_label": st["shop_label"],
            "business_type": st["business_type"], "unit": st["unit"], "has_size": st["has_size"],
            "variant_mode": st.get("variant_mode", "so"), "variant_min": st.get("variant_min", 24),
            "variant_max": st.get("variant_max", 46), "variant_labels": st.get("variant_labels", []),
            "fb_page_id": st["fb_page_id"], "fb_page_token": st["fb_page_token"],
            "tone": st["tone"], "status": st["status"], "policies": st.get("policies", {}),
            "custom_prompt": st.get("custom_prompt", ""),
            "channels": st.get("channels", {}),
            "zalo_enabled": (st.get("channels", {}).get("zalo_personal") or {}).get("enabled", False),
            "menu": list(st["products"].values()),
        })
    try:
        with open(_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(data_out, f, ensure_ascii=False, indent=2)
    except OSError as e:
        print(f"[stores] không ghi được config: {e}")


def _load() -> None:
    if not os.path.exists(_CONFIG_PATH):
        return
    try:
        with open(_CONFIG_PATH, encoding="utf-8") as f:
            saved = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"[stores] không đọc được config: {e}")
        return
    for s in saved:
        st = {k: s.get(k) for k in ("id", "name", "shop_label", "business_type", "unit",
                                     "has_size", "fb_page_id", "fb_page_token", "tone", "status")}
        st["custom_prompt"] = s.get("custom_prompt", "")
        st["variant_mode"] = s.get("variant_mode") or ("so" if st["has_size"] else "khong_co")
        st["variant_min"] = s.get("variant_min", 24)
        st["variant_max"] = s.get("variant_max", 46)
        st["variant_labels"] = s.get("variant_labels") or []
        st["policies"] = s.get("policies") or _DEFAULT_RETAIL_POLICIES
        st["products"] = {m["code"]: m for m in s.get("menu", [])}
        _refresh_categories(st)
        # Migration đa kênh (câu 1/9): config cũ (không có `channels`) → dựng từ field
        # phẳng fb_page_id/fb_page_token + zalo_enabled. Config đã lưu `channels` (từ lần
        # _persist() sau khi có tính năng này) → dùng thẳng, không dựng lại đè mất dữ liệu.
        st["channels"] = s.get("channels") or _build_channels_from_flat(
            {**st, "zalo_enabled": s.get("zalo_enabled", False)})
        _STORES[st["id"]] = st


_load()
