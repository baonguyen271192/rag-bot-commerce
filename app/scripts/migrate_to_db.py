"""Seed 3 cửa hàng builtin (default/shop2/chao) + copy lịch sử đơn từ `orders.db`
cũ vào `commerce.db` — script này được `stores.py` (comment "Quản lý Bot") nhắc tới
nhưng trước đó chưa từng được viết, nên sau khi lượt [1a] chuyển stores.py sang đọc
từ DB, `commerce.db` không có sẵn store nào -> `GET /api/admin/stores` trả về rỗng.

Dữ liệu builtin lấy lại NGUYÊN VĂN từ bản dict RAM cũ (`git show HEAD:app/stores.py`,
trước lượt [1a]) — không bịa thêm field nào.

An toàn chạy lại nhiều lần: bỏ qua store đã tồn tại, dùng INSERT OR IGNORE cho orders.

Chạy: commerce/.venv/bin/python -m app.scripts.migrate_to_db
"""
from __future__ import annotations

import os
import sqlite3

from dotenv import load_dotenv

load_dotenv()  # CREDENTIALS_KEY (đọc bởi crypto.py qua repository.py) sống ở .env,
                # giống cách main.py load_dotenv() trước khi import các module đụng DB.

from .. import repository
from ..catalog import PRODUCTS
from ..stores import _CHAO_POLICIES, _DEFAULT_RETAIL_POLICIES

_OLD_ORDERS_DB = os.path.join(os.path.dirname(__file__), "..", "orders.db")
_TENANT_ID = "tenant-main"

# Menu quán cháo — copy nguyên văn từ `_CHAO_MENU`/`_dish()` trong bản stores.py cũ
# (đã bị xoá khỏi module đó sau lượt [1a] DB hoá).
_CHAO_MENU = [
    {"code": "CHAO_NGHEU", "name": "Cháo nghêu", "category": "Cháo",
     "retail": 30000, "wholesale": 30000, "sizes": {}, "image": "", "images": []},
    {"code": "CHAO_NGHEU_DB", "name": "Cháo nghêu đặc biệt", "category": "Cháo",
     "retail": 45000, "wholesale": 45000, "sizes": {}, "image": "", "images": []},
    {"code": "CHAO_SUON", "name": "Cháo sườn", "category": "Cháo",
     "retail": 35000, "wholesale": 35000, "sizes": {}, "image": "", "images": []},
    {"code": "CHAO_HAU", "name": "Cháo hàu", "category": "Cháo",
     "retail": 40000, "wholesale": 40000, "sizes": {}, "image": "", "images": []},
    {"code": "CHAO_XUONG", "name": "Cháo xương", "category": "Cháo",
     "retail": 30000, "wholesale": 30000, "sizes": {}, "image": "", "images": []},
    {"code": "CHAO_THAPCAM", "name": "Cháo thập cẩm (nghêu + sườn + hàu)", "category": "Cháo",
     "retail": 50000, "wholesale": 50000, "sizes": {}, "image": "", "images": []},
    {"code": "TP_QUAY", "name": "Quẩy", "category": "Topping",
     "retail": 10000, "wholesale": 10000, "sizes": {}, "image": "", "images": []},
    {"code": "TP_TRUNG", "name": "Trứng", "category": "Topping",
     "retail": 8000, "wholesale": 8000, "sizes": {}, "image": "", "images": []},
    {"code": "TP_NGHEU", "name": "Thêm nghêu", "category": "Topping",
     "retail": 20000, "wholesale": 20000, "sizes": {}, "image": "", "images": []},
    {"code": "NUOC_TRATAC", "name": "Trà tắc", "category": "Nước",
     "retail": 12000, "wholesale": 12000, "sizes": {}, "image": "", "images": []},
    {"code": "NUOC_SUOI", "name": "Nước suối", "category": "Nước",
     "retail": 8000, "wholesale": 8000, "sizes": {}, "image": "", "images": []},
]

_BUILTINS = [
    {
        "id": "default", "name": "Giày BQ (demo)", "shop_label": "Shop Giày BQ",
        "business_type": "shoe", "unit": "đôi", "has_size": True,
        "variant_mode": "so", "variant_min": 24, "variant_max": 46, "tone": "warm",
        "policies": _DEFAULT_RETAIL_POLICIES,
        "products": list(PRODUCTS.values()),
        "fb_page_id_env": "FB_PAGE_ID_DEFAULT", "fb_page_token_env": "PAGE_ACCESS_TOKEN_DEFAULT",
    },
    {
        "id": "shop2", "name": "Giày Nam Phong Cách", "shop_label": "Shop Giày Nam Phong Cách",
        "business_type": "shoe", "unit": "đôi", "has_size": True,
        "variant_mode": "so", "variant_min": 24, "variant_max": 46, "tone": "warm",
        "policies": _DEFAULT_RETAIL_POLICIES,
        # Catalog demo thứ 2 = CHỈ giày nam (khớp bản cũ, để nhìn rõ khác biệt khi demo).
        "products": [p for p in PRODUCTS.values() if p["category"] == "Giày Nam"],
        "fb_page_id_env": "FB_PAGE_ID_SHOP2", "fb_page_token_env": "PAGE_ACCESS_TOKEN_SHOP2",
    },
    {
        "id": "chao", "name": "Cháo Nghêu O Hoèn", "shop_label": "Cháo Nghêu O Hoèn",
        "business_type": "food", "unit": "phần", "has_size": False,
        "variant_mode": "khong_co", "variant_min": None, "variant_max": None, "tone": "warm",
        "policies": _CHAO_POLICIES,
        "products": _CHAO_MENU,
        "fb_page_id_env": "FB_PAGE_ID_CHAO", "fb_page_token_env": "PAGE_ACCESS_TOKEN_CHAO",
    },
]


def _seed_stores() -> None:
    if not repository.get_tenant(_TENANT_ID):
        repository.create_tenant(_TENANT_ID, "Tenant chính (demo)")
    for cfg in _BUILTINS:
        sid = cfg["id"]
        if repository.store_exists(sid):
            print(f"  - {sid}: đã tồn tại, bỏ qua")
            continue
        repository.create_store_row({
            "id": sid, "tenant_id": _TENANT_ID, "name": cfg["name"],
            "shop_label": cfg["shop_label"], "business_type": cfg["business_type"],
            "unit": cfg["unit"], "has_size": cfg["has_size"],
            "variant_mode": cfg["variant_mode"], "variant_min": cfg["variant_min"],
            "variant_max": cfg["variant_max"], "variant_labels": [], "tone": cfg["tone"],
            "custom_prompt": "", "policies_json": cfg["policies"],
            "status": "active", "builtin": 1,
        })
        repository.replace_products(sid, cfg["products"])
        # Seed kênh Facebook từ env — khớp hành vi seed cũ (mỗi store 1 cặp env riêng);
        # KHÔNG bịa page_id/token nếu env trống, store sẽ hiện "chưa bật kênh nào".
        page_id = os.getenv(cfg["fb_page_id_env"], "")
        page_token = os.getenv(cfg["fb_page_token_env"], "")
        if page_id or page_token:
            repository.upsert_channel(sid, "facebook", {
                "enabled": bool(page_id and page_token),
                "page_id": page_id, "page_token": page_token,
            })
        print(f"  - {sid}: đã seed ({len(cfg['products'])} món)")


def _migrate_old_orders() -> None:
    """Copy đơn từ `orders.db` (file .db riêng, tiền-[1a]) sang bảng `orders` trong
    `commerce.db` — chỉ copy đơn của store đã tồn tại (tránh đơn mồ côi do vướng FK)."""
    if not os.path.exists(_OLD_ORDERS_DB):
        print("  - không tìm thấy orders.db cũ, bỏ qua")
        return
    src = sqlite3.connect(_OLD_ORDERS_DB)
    src.row_factory = sqlite3.Row
    rows = src.execute("SELECT * FROM orders").fetchall()
    src.close()
    if not rows:
        print("  - orders.db cũ rỗng, bỏ qua")
        return
    cols = rows[0].keys()
    dst = sqlite3.connect(repository.DB_PATH)
    try:
        existing_stores = {r[0] for r in dst.execute("SELECT id FROM stores").fetchall()}
        placeholders = ",".join(["?"] * len(cols))
        n = 0
        for r in rows:
            if r["store_id"] not in existing_stores:
                continue
            dst.execute(
                f"INSERT OR IGNORE INTO orders ({','.join(cols)}) VALUES ({placeholders})",
                tuple(r[col] for col in cols),
            )
            n += 1
        dst.commit()
    finally:
        dst.close()
    print(f"  - đã copy {n} đơn từ orders.db cũ (bỏ qua nếu id đã tồn tại)")


def main() -> None:
    repository.init_db()
    print("Seed cửa hàng builtin...")
    _seed_stores()
    print("Copy lịch sử đơn hàng cũ...")
    _migrate_old_orders()
    print("Xong.")


if __name__ == "__main__":
    main()
