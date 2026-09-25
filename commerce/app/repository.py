"""Lớp truy cập DB DUY NHẤT của Commerce (Q3 — 1 file, gộp cả `orders`).

Chỉ SQL thuần + encrypt/decrypt credentials (Q2) — KHÔNG chứa business rule (dựng lại
shape dict store/product cũ đủ key, đồng bộ field phẳng FB, validate trùng external_id...
những việc đó nằm ở `stores.py`/`store.py`, giữ module này vô trạng thái/không giả định
caller). Mọi hàm products/channel/order/config NHẬN `store_id` và đưa vào WHERE — không
có hàm "lấy theo id thô" bỏ qua store_id, TRỪ 2 hàm routing (`find_store_by_external_id`,
`external_id_owner`) chỉ TRẢ store_id, không trả dữ liệu store.

1 file `.db` DUY NHẤT (Q4) chứa cả 5 bảng — đường dẫn từ biến môi trường
`COMMERCE_DB_PATH` (đọc lúc import, giống cách `store.py` cũ đọc `_DB_PATH`). `stores`
KHÔNG có cột `category` (Q5) — category phát sinh từ `products`.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from datetime import datetime, timezone

from . import crypto

DB_PATH = os.getenv(
    "COMMERCE_DB_PATH", os.path.join(os.path.dirname(__file__), "commerce.db")
)

# Khoá riêng cho việc SINH mã đơn (đọc-rồi-ghi id lớn nhất) — tách khỏi mọi ghi khác để
# không tự khoá chặn các INSERT/UPDATE không liên quan (giữ đúng phạm vi khoá như
# `store.py` cũ, chỉ khoá quanh _next_order_id() + insert).
_order_lock = threading.Lock()

# platform -> field "external id" dùng để route (facebook->page_id, zalo_oa->oa_id).
# zalo_personal không route bằng external id (sidecar tự biết store_id của phiên nó).
_CHANNEL_EXTERNAL_ID_FIELD = {"facebook": "page_id", "zalo_oa": "oa_id"}

# platform -> field SECRET (đi vào cột `credentials`, mã hoá Fernet).
_CHANNEL_SECRET_FIELDS = {
    "facebook": ("page_token",),
    "zalo_oa": ("app_secret", "oa_access_token", "oa_refresh_token"),
    "zalo_personal": (),
}

# platform -> field phụ KHÔNG secret (đi vào cột `extra_json`, plaintext).
_CHANNEL_EXTRA_FIELDS = {
    "facebook": (),
    "zalo_oa": ("app_id", "token_expires_at"),
    "zalo_personal": (),
}

# Field phụ của product KHÔNG phải cột chuẩn -> gói vào `extra_json` (R1 trong kế hoạch).
_PRODUCT_EXTRA_FIELDS = ("base_code", "color", "description", "wholesale", "images")

_STORE_ROW_COLUMNS = (
    "id", "tenant_id", "name", "shop_label", "business_type", "unit", "has_size",
    "variant_mode", "variant_min", "variant_max", "variant_labels", "tone",
    "custom_prompt", "policies_json", "status", "builtin", "created_at",
)


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    # SQLite mặc định TẮT foreign key enforcement — phải bật lại MỖI connection (Q4).
    c.execute("PRAGMA foreign_keys = ON")
    return c


def init_db() -> None:
    """Tạo 5 bảng (tenants/stores/products/channels/orders) nếu chưa có. An toàn gọi
    nhiều lần (IF NOT EXISTS) — `main.py` gọi lúc khởi động, giống `store.init_db()` cũ."""
    with _conn() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS tenants (
                id            TEXT PRIMARY KEY,
                name          TEXT NOT NULL,
                model_id      TEXT,
                monthly_quota INTEGER,
                status        TEXT NOT NULL DEFAULT 'active',
                created_at    TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS stores (
                id             TEXT PRIMARY KEY,
                tenant_id      TEXT NOT NULL,
                name           TEXT NOT NULL,
                shop_label     TEXT,
                business_type  TEXT,
                unit           TEXT,
                has_size       INTEGER,
                variant_mode   TEXT,
                variant_min    INTEGER,
                variant_max    INTEGER,
                variant_labels TEXT,
                tone           TEXT,
                custom_prompt  TEXT,
                policies_json  TEXT,
                status         TEXT NOT NULL DEFAULT 'active',
                builtin        INTEGER NOT NULL DEFAULT 0,
                created_at     TEXT,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            );

            CREATE TABLE IF NOT EXISTS products (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                store_id   TEXT NOT NULL,
                code       TEXT NOT NULL,
                name       TEXT NOT NULL,
                price      INTEGER NOT NULL,
                category   TEXT,
                sizes_json TEXT,
                image_url  TEXT,
                extra_json TEXT,
                UNIQUE (store_id, code),
                FOREIGN KEY (store_id) REFERENCES stores(id)
            );
            CREATE INDEX IF NOT EXISTS ix_products_store ON products(store_id);

            CREATE TABLE IF NOT EXISTS channels (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                store_id     TEXT NOT NULL,
                platform     TEXT NOT NULL,
                external_id  TEXT,
                credentials  TEXT,
                extra_json   TEXT,
                enabled      INTEGER NOT NULL DEFAULT 0,
                UNIQUE (store_id, platform),
                FOREIGN KEY (store_id) REFERENCES stores(id)
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ux_channel_external
                ON channels(platform, external_id)
                WHERE external_id IS NOT NULL AND external_id <> '';

            CREATE TABLE IF NOT EXISTS orders (
                id                TEXT PRIMARY KEY,
                store_id          TEXT NOT NULL,
                items_json        TEXT NOT NULL,
                subtotal          INTEGER NOT NULL,
                payment           TEXT,
                status            TEXT NOT NULL,
                channel           TEXT NOT NULL,
                created_at        TEXT NOT NULL,
                customer_name     TEXT,
                customer_phone    TEXT,
                customer_address  TEXT,
                fb_psid           TEXT,
                flagged           INTEGER DEFAULT 0,
                flag_note         TEXT,
                FOREIGN KEY (store_id) REFERENCES stores(id)
            );
            """
        )
        # Phòng thủ: nếu bảng `orders` được TẠO TRƯỚC (vd DB copy tay từ bản cũ chưa có
        # 2 cột này) thì thêm cột — giữ y logic phòng thủ cũ của `store.py`.
        cols = {r["name"] for r in c.execute("PRAGMA table_info(orders)").fetchall()}
        if "flagged" not in cols:
            c.execute("ALTER TABLE orders ADD COLUMN flagged INTEGER DEFAULT 0")
        if "flag_note" not in cols:
            c.execute("ALTER TABLE orders ADD COLUMN flag_note TEXT")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ==================== tenants ====================

def create_tenant(id: str, name: str, model_id: str | None = None,
                   monthly_quota: int | None = None, status: str = "active") -> dict:
    with _conn() as c:
        c.execute(
            "INSERT INTO tenants (id, name, model_id, monthly_quota, status, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (id, name, model_id, monthly_quota, status, now_iso()),
        )
    return get_tenant(id)


def get_tenant(tenant_id: str) -> dict | None:
    with _conn() as c:
        row = c.execute("SELECT * FROM tenants WHERE id=?", (tenant_id,)).fetchone()
    return dict(row) if row else None


def list_tenants() -> list[dict]:
    with _conn() as c:
        rows = c.execute("SELECT * FROM tenants ORDER BY rowid").fetchall()
    return [dict(r) for r in rows]


# ==================== stores ====================

def _store_row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["has_size"] = bool(d["has_size"])
    d["builtin"] = bool(d["builtin"])
    d["variant_labels"] = json.loads(d["variant_labels"]) if d.get("variant_labels") else []
    d["policies"] = json.loads(d["policies_json"]) if d.get("policies_json") else {}
    d.pop("policies_json", None)
    return d


def create_store_row(row: dict) -> None:
    data = dict(row)
    data["variant_labels"] = json.dumps(data.get("variant_labels") or [], ensure_ascii=False)
    policies = data.get("policies_json", data.get("policies", {}))
    data["policies_json"] = json.dumps(policies or {}, ensure_ascii=False)
    data["has_size"] = int(bool(data.get("has_size")))
    data["builtin"] = int(bool(data.get("builtin", 0)))
    data.setdefault("created_at", now_iso())
    vals = [data.get(col) for col in _STORE_ROW_COLUMNS]
    placeholders = ",".join(["?"] * len(_STORE_ROW_COLUMNS))
    with _conn() as c:
        c.execute(
            f"INSERT INTO stores ({','.join(_STORE_ROW_COLUMNS)}) VALUES ({placeholders})",
            vals,
        )


def get_store_row(store_id: str) -> dict | None:
    with _conn() as c:
        row = c.execute("SELECT * FROM stores WHERE id=?", (store_id,)).fetchone()
    return _store_row_to_dict(row) if row else None


def list_store_rows() -> list[dict]:
    """Thứ tự = thứ tự chèn (rowid) — khớp `_STORES.values()` (dict Python giữ thứ tự
    chèn) của bản RAM cũ, để `all_stores()` không đổi thứ tự hiển thị."""
    with _conn() as c:
        rows = c.execute("SELECT * FROM stores ORDER BY rowid").fetchall()
    return [_store_row_to_dict(r) for r in rows]


def update_store_row(store_id: str, patch: dict) -> None:
    if not patch:
        return
    sets, vals = [], []
    for k, v in patch.items():
        if k == "variant_labels":
            v = json.dumps(v or [], ensure_ascii=False)
        elif k in ("policies", "policies_json"):
            k = "policies_json"
            v = json.dumps(v or {}, ensure_ascii=False)
        elif k in ("has_size", "builtin"):
            v = int(bool(v))
        sets.append(f"{k} = ?")
        vals.append(v)
    vals.append(store_id)
    with _conn() as c:
        c.execute(f"UPDATE stores SET {', '.join(sets)} WHERE id = ?", vals)


def delete_store_row(store_id: str) -> None:
    """Xoá store + products/channels kèm (tay, không có ON DELETE CASCADE trong DDL).
    LƯU Ý: `orders.store_id` vẫn FK -> stores(id) và KHÔNG bị xoá kèm ở đây — nếu store
    còn đơn, DELETE FROM stores sẽ bị chặn bởi ràng buộc FK (giữ đơn không bị mất/orphan
    thay vì xoá âm thầm) — khác hành vi cũ (dict RAM xoá vô điều kiện, đơn ở DB orders
    riêng không bị đụng). Xem ghi chú tự-quyết trong .bangiao/thay-doi.md."""
    with _conn() as c:
        c.execute("DELETE FROM products WHERE store_id=?", (store_id,))
        c.execute("DELETE FROM channels WHERE store_id=?", (store_id,))
        c.execute("DELETE FROM stores WHERE id=?", (store_id,))


def store_exists(store_id: str) -> bool:
    with _conn() as c:
        row = c.execute("SELECT 1 FROM stores WHERE id=?", (store_id,)).fetchone()
    return row is not None


# ==================== products (LUÔN kèm store_id) ====================

def _product_row_to_dict(row) -> dict:
    extra = json.loads(row["extra_json"]) if row["extra_json"] else {}
    sizes = json.loads(row["sizes_json"]) if row["sizes_json"] else {}
    price = row["price"]
    return {
        "code": row["code"],
        "base_code": extra.get("base_code", ""),
        "name": row["name"],
        "category": row["category"],
        "color": extra.get("color", ""),
        "description": extra.get("description", ""),
        "retail": price,
        "wholesale": extra.get("wholesale", price),
        "sizes": sizes,
        "image": row["image_url"] or "",
        "images": extra.get("images") or [],
    }


def list_products(store_id: str) -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM products WHERE store_id=? ORDER BY id", (store_id,)
        ).fetchall()
    return [_product_row_to_dict(r) for r in rows]


def list_categories(store_id: str) -> list[str]:
    """SELECT DISTINCT category (Q1 — category KHÔNG lưu cột/bảng riêng). GROUP BY +
    ORDER BY MIN(id) để giữ thứ tự XUẤT HIỆN LẦN ĐẦU trong catalog (không alphabet hoá
    ngẫu nhiên) — gần nhất với hành vi cũ có thể đạt được qua SQL thuần; xem lưu ý
    tự-quyết trong .bangiao/thay-doi.md về khác biệt thứ tự với store 'default'/'shop2'
    (trước đây 2 store này dùng list category HARDCODE, không phát sinh từ catalog)."""
    with _conn() as c:
        rows = c.execute(
            "SELECT category FROM products WHERE store_id=? AND category IS NOT NULL "
            "AND category <> '' GROUP BY category ORDER BY MIN(id)",
            (store_id,),
        ).fetchall()
    return [r["category"] for r in rows]


def upsert_product(store_id: str, item: dict) -> dict:
    code = str(item["code"]).strip().upper()
    name = item["name"]
    price = int(item.get("retail", item.get("price", 0)))
    category = item.get("category") or "Khác"
    sizes = item.get("sizes") or {}
    image = item.get("image") or ""
    extra = {
        "base_code": item.get("base_code", ""),
        "color": item.get("color", ""),
        "description": item.get("description", ""),
        "wholesale": item.get("wholesale", price),
        "images": item.get("images") or [],
    }
    sizes_json = json.dumps(sizes, ensure_ascii=False)
    extra_json = json.dumps(extra, ensure_ascii=False)
    with _conn() as c:
        c.execute(
            """INSERT INTO products (store_id, code, name, price, category, sizes_json,
                                      image_url, extra_json)
               VALUES (?,?,?,?,?,?,?,?)
               ON CONFLICT(store_id, code) DO UPDATE SET
                 name=excluded.name, price=excluded.price, category=excluded.category,
                 sizes_json=excluded.sizes_json, image_url=excluded.image_url,
                 extra_json=excluded.extra_json""",
            (store_id, code, name, price, category, sizes_json, image, extra_json),
        )
    return {
        "code": code, "base_code": extra["base_code"], "name": name, "category": category,
        "color": extra["color"], "description": extra["description"], "retail": price,
        "wholesale": extra["wholesale"], "sizes": sizes, "image": image,
        "images": extra["images"],
    }


def delete_product(store_id: str, code: str) -> None:
    with _conn() as c:
        c.execute(
            "DELETE FROM products WHERE store_id=? AND code=?", (store_id, code.upper())
        )


def replace_products(store_id: str, items: list[dict]) -> None:
    """Xoá hết products cũ của store rồi ghi lại THEO ĐÚNG THỨ TỰ `items` (dùng cho
    seed/migrate) — id AUTOINCREMENT tăng dần theo thứ tự chèn nên `list_categories()`
    (ORDER BY MIN(id)) tái tạo đúng thứ tự xuất hiện lần đầu của catalog gốc."""
    with _conn() as c:
        c.execute("DELETE FROM products WHERE store_id=?", (store_id,))
    for item in items:
        upsert_product(store_id, item)


# ==================== channels (LUÔN kèm store_id trừ 2 hàm routing) ====================

def _channel_row_to_dict(row) -> dict:
    platform = row["platform"]
    extra = json.loads(row["extra_json"]) if row["extra_json"] else {}
    secret = crypto.decrypt_dict(row["credentials"]) if row["credentials"] else {}
    out: dict = {"enabled": bool(row["enabled"])}
    id_field = _CHANNEL_EXTERNAL_ID_FIELD.get(platform)
    if id_field:
        out[id_field] = row["external_id"] or ""
    out.update(extra)
    out.update(secret)
    return out


def get_channel(store_id: str, platform: str) -> dict | None:
    with _conn() as c:
        row = c.execute(
            "SELECT * FROM channels WHERE store_id=? AND platform=?", (store_id, platform)
        ).fetchone()
    return _channel_row_to_dict(row) if row else None


def list_channels(store_id: str) -> list[dict]:
    with _conn() as c:
        rows = c.execute("SELECT * FROM channels WHERE store_id=?", (store_id,)).fetchall()
    return [{**_channel_row_to_dict(r), "platform": r["platform"]} for r in rows]


def upsert_channel(store_id: str, platform: str, cfg: dict) -> None:
    """Merge `cfg` vào cấu hình cũ (không xoá field không truyền) rồi ghi — giữ đúng
    ngữ nghĩa 'merge, không replace' của `stores.set_channel()` cũ. Secret (Q2) mã hoá
    Fernet TRƯỚC khi ghi cột `credentials`; field không secret vào `extra_json`."""
    existing = get_channel(store_id, platform) or {}
    merged = {**existing, **cfg}
    id_field = _CHANNEL_EXTERNAL_ID_FIELD.get(platform)
    external_id = merged.get(id_field, "") if id_field else None
    secret = {k: merged.get(k, "") for k in _CHANNEL_SECRET_FIELDS.get(platform, ())}
    extra = {k: merged.get(k, "") for k in _CHANNEL_EXTRA_FIELDS.get(platform, ())}
    enabled = bool(merged.get("enabled"))
    credentials = crypto.encrypt_dict(secret) if secret else None
    extra_json = json.dumps(extra, ensure_ascii=False) if extra else None
    with _conn() as c:
        c.execute(
            """INSERT INTO channels (store_id, platform, external_id, credentials,
                                      extra_json, enabled)
               VALUES (?,?,?,?,?,?)
               ON CONFLICT(store_id, platform) DO UPDATE SET
                 external_id=excluded.external_id, credentials=excluded.credentials,
                 extra_json=excluded.extra_json, enabled=excluded.enabled""",
            (store_id, platform, external_id, credentials, extra_json, int(enabled)),
        )


def delete_channel(store_id: str, platform: str) -> None:
    with _conn() as c:
        c.execute(
            "DELETE FROM channels WHERE store_id=? AND platform=?", (store_id, platform)
        )


def find_store_by_external_id(platform: str, external_id: str,
                                only_enabled: bool = True) -> str | None:
    """Routing: store nào đang khai `external_id` này ở `platform` (vd page_id Facebook).
    CHỈ trả store_id — không trả dữ liệu store (business rule dựng dict store ở
    `stores.py`)."""
    if not external_id:
        return None
    q = "SELECT store_id FROM channels WHERE platform=? AND external_id=?"
    args: list = [platform, external_id]
    if only_enabled:
        q += " AND enabled=1"
    with _conn() as c:
        row = c.execute(q, tuple(args)).fetchone()
    return row["store_id"] if row else None


def external_id_owner(platform: str, external_id: str,
                       exclude_store_id: str | None = None) -> str | None:
    """Store (bất kể enabled) đang khai `external_id` này ở `platform`, KHÁC
    `exclude_store_id` — dùng để chặn trùng khi validate trước khi ghi (câu 6 cũ)."""
    if not external_id:
        return None
    q = "SELECT store_id FROM channels WHERE platform=? AND external_id=?"
    args: list = [platform, external_id]
    if exclude_store_id:
        q += " AND store_id != ?"
        args.append(exclude_store_id)
    with _conn() as c:
        row = c.execute(q, tuple(args)).fetchone()
    return row["store_id"] if row else None


# ==================== orders (gộp vào đây theo Q3) ====================

def _order_row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["items"] = json.loads(d.pop("items_json"))
    return d


def _next_order_id() -> str:
    with _conn() as c:
        row = c.execute(
            "SELECT id FROM orders WHERE id LIKE 'DH%' ORDER BY id DESC LIMIT 1"
        ).fetchone()
    n = 1000
    if row:
        try:
            n = int(row["id"].replace("DH", ""))
        except ValueError:
            pass
    return f"DH{n + 1}"


def create_order(items: list, subtotal: int, customer: dict, payment: str, channel: str,
                  created_at: str, store_id: str) -> dict:
    with _order_lock:
        oid = _next_order_id()
        with _conn() as c:
            c.execute(
                """INSERT INTO orders (id, store_id, items_json, subtotal, payment, status,
                   channel, created_at, customer_name, customer_phone, customer_address,
                   fb_psid)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (oid, store_id, json.dumps(items, ensure_ascii=False), subtotal, payment,
                 "Chờ xác nhận", channel, created_at,
                 customer.get("name", "Khách"), customer.get("phone", ""),
                 customer.get("address", ""), customer.get("fb_psid")),
            )
    return get_order(oid, store_id)


def create_order_with_stock(items: list, subtotal: int, customer: dict, payment: str,
                             channel: str, created_at: str, store_id: str,
                             has_size: bool = False) -> tuple[dict | None, list[dict] | None]:
    """Như `create_order`, nhưng khi `has_size` (ngành có biến thể theo size): kiểm tra VÀ
    trừ tồn kho từng size TRONG CÙNG `_order_lock` với việc sinh mã đơn + insert — để 2
    khách chốt đơn đúng lúc cùng lấy 1 size cuối cùng không thể cả hai cùng thành công
    (trước đây `create_order` không đụng tồn kho, mỗi giỏ hàng chỉ tự so với chính nó nên
    2 khách khác phiên có thể cùng "mua" hết 1 size chỉ còn 1 đôi).

    Trả (order, None) khi thành công. Trả (None, shortages) khi có (mã, size) không đủ —
    KHÔNG tạo đơn, KHÔNG trừ bất kỳ size nào (tất cả-hoặc-không-gì cho cả giỏ hàng), để
    caller quyết định báo khách và điều chỉnh giỏ thế nào.

    Ngành không có size (`has_size=False`, vd quán ăn) giữ nguyên hành vi cũ: luôn tạo
    đơn, không đụng tồn kho — ngành này hiện chưa có khái niệm tồn kho theo món/phần
    trong schema, đây KHÔNG phải phạm vi sửa của hàm này.
    """
    with _order_lock:
        shortages: list[dict] = []
        if has_size:
            with _conn() as c:
                stock: dict[str, dict] = {}
                for it in items:
                    code = it["code"]
                    if code not in stock:
                        row = c.execute(
                            "SELECT sizes_json FROM products WHERE store_id=? AND code=?",
                            (store_id, code)).fetchone()
                        stock[code] = json.loads(row["sizes_json"]) if row and row["sizes_json"] else {}
                for it in items:
                    sizes = stock.get(it["code"], {})
                    for size, qty in it["sizes"].items():
                        if sizes.get(size, 0) < qty:
                            shortages.append({
                                "code": it["code"], "name": it.get("name", it["code"]),
                                "size": size, "available": sizes.get(size, 0), "requested": qty,
                            })
                if shortages:
                    return None, shortages
                for it in items:
                    sizes = stock[it["code"]]
                    for size, qty in it["sizes"].items():
                        sizes[size] = sizes[size] - qty
                    c.execute("UPDATE products SET sizes_json=? WHERE store_id=? AND code=?",
                              (json.dumps(sizes, ensure_ascii=False), store_id, it["code"]))
        oid = _next_order_id()
        with _conn() as c:
            c.execute(
                """INSERT INTO orders (id, store_id, items_json, subtotal, payment, status,
                   channel, created_at, customer_name, customer_phone, customer_address,
                   fb_psid)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (oid, store_id, json.dumps(items, ensure_ascii=False), subtotal, payment,
                 "Chờ xác nhận", channel, created_at,
                 customer.get("name", "Khách"), customer.get("phone", ""),
                 customer.get("address", ""), customer.get("fb_psid")),
            )
    return get_order(oid, store_id), None


def get_order(oid: str, store_id: str | None = None) -> dict | None:
    q, args = "SELECT * FROM orders WHERE id = ?", [oid]
    if store_id:
        q += " AND store_id = ?"
        args.append(store_id)
    with _conn() as c:
        row = c.execute(q, tuple(args)).fetchone()
    return _order_row_to_dict(row) if row else None


def list_orders(store_id: str | None = None) -> list[dict]:
    q = "SELECT * FROM orders"
    args: tuple = ()
    if store_id:
        q += " WHERE store_id = ?"
        args = (store_id,)
    q += " ORDER BY id DESC"
    with _conn() as c:
        rows = c.execute(q, args).fetchall()
    return [_order_row_to_dict(r) for r in rows]


def set_order_status(oid: str, status: str) -> dict | None:
    with _conn() as c:
        c.execute("UPDATE orders SET status = ? WHERE id = ?", (status, oid))
    return get_order(oid)


def list_orders_by_psid(psid: str | None, store_id: str | None = None) -> list[dict]:
    if not psid:
        return []
    q, args = "SELECT * FROM orders WHERE fb_psid = ?", [psid]
    if store_id:
        q += " AND store_id = ?"
        args.append(store_id)
    q += " ORDER BY id DESC LIMIT 5"
    with _conn() as c:
        rows = c.execute(q, tuple(args)).fetchall()
    return [_order_row_to_dict(r) for r in rows]


def flag_order(oid: str, note: str) -> dict | None:
    """Gắn cờ + CỘNG DỒN ghi chú (không ghi đè) — khách có thể phàn nàn nhiều lần về cùng
    1 đơn vì nhiều lý do khác nhau (vd lần 1 'giao sai màu', lần 2 'thiếu 1 đôi tất');
    ghi đè như bản cũ sẽ làm mất phàn nàn trước đó, nhân viên chỉ thấy đúng ý gần nhất."""
    with _conn() as c:
        row = c.execute("SELECT flag_note FROM orders WHERE id = ?", (oid,)).fetchone()
        old = (row["flag_note"] if row else None) or ""
        stamp = datetime.now(timezone.utc).strftime("%d/%m %H:%M")
        entry = f"[{stamp}] {note}".strip()
        merged = f"{old}\n{entry}" if old else entry
        c.execute("UPDATE orders SET flagged = 1, flag_note = ? WHERE id = ?", (merged, oid))
    return get_order(oid)
