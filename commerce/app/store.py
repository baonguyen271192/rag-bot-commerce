"""Kho đơn hàng (SQLite) của Commerce — đơn khách đặt qua bot, đa cửa hàng (store_id).

Mỗi cửa hàng (tenant) có đơn riêng, lọc bằng `store_id`. Khi lên production thay
SQLite bằng DB thật, giữ nguyên interface.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading

_DB_PATH = os.path.join(os.path.dirname(__file__), "orders.db")
_lock = threading.Lock()


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init_db() -> None:
    with _conn() as c:
        c.execute("""
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
                fb_psid           TEXT
            )
        """)
        # Migrate DB cũ (tạo trước khi có tính năng gắn cờ than phiền) — thêm cột nếu thiếu.
        cols = {r["name"] for r in c.execute("PRAGMA table_info(orders)").fetchall()}
        if "flagged" not in cols:
            c.execute("ALTER TABLE orders ADD COLUMN flagged INTEGER DEFAULT 0")
        if "flag_note" not in cols:
            c.execute("ALTER TABLE orders ADD COLUMN flag_note TEXT")


def _next_order_id() -> str:
    """Mã đơn dùng chung 'DH<số>' — đọc từ đơn lớn nhất đã có để không trùng khi restart."""
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


def create_retail_order(items: list, subtotal: int, customer: dict, payment: str,
                        channel: str, created_at: str, store_id: str = "default") -> dict:
    """Tạo đơn khách đặt qua bot. customer = {name, phone, address, fb_psid?}."""
    with _lock:
        oid = _next_order_id()
        with _conn() as c:
            c.execute(
                """INSERT INTO orders (id, store_id, items_json, subtotal, payment, status,
                   channel, created_at, customer_name, customer_phone, customer_address, fb_psid)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (oid, store_id, json.dumps(items, ensure_ascii=False), subtotal, payment,
                 "Chờ xác nhận", channel, created_at,
                 customer.get("name", "Khách"), customer.get("phone", ""),
                 customer.get("address", ""), customer.get("fb_psid")),
            )
    return get_order(oid, store_id)


def get_order(oid: str, store_id: str | None = None) -> dict | None:
    q, args = "SELECT * FROM orders WHERE id = ?", [oid]
    if store_id:
        q += " AND store_id = ?"
        args.append(store_id)
    with _conn() as c:
        row = c.execute(q, tuple(args)).fetchone()
    return _row_to_dict(row) if row else None


def list_orders(store_id: str | None = None) -> list[dict]:
    q = "SELECT * FROM orders"
    args: tuple = ()
    if store_id:
        q += " WHERE store_id = ?"
        args = (store_id,)
    q += " ORDER BY id DESC"
    with _conn() as c:
        rows = c.execute(q, args).fetchall()
    return [_row_to_dict(r) for r in rows]


def set_status(oid: str, status: str) -> dict | None:
    with _conn() as c:
        c.execute("UPDATE orders SET status = ? WHERE id = ?", (status, oid))
    return get_order(oid)


def list_orders_by_psid(psid: str | None, store_id: str | None = None) -> list[dict]:
    """Đơn gần nhất của 1 khách (theo PSID Messenger) — dùng để tự tra đơn khi khách
    than phiền, không cần khách gõ lại mã đơn."""
    if not psid:
        return []
    q, args = "SELECT * FROM orders WHERE fb_psid = ?", [psid]
    if store_id:
        q += " AND store_id = ?"
        args.append(store_id)
    q += " ORDER BY id DESC LIMIT 5"
    with _conn() as c:
        rows = c.execute(q, tuple(args)).fetchall()
    return [_row_to_dict(r) for r in rows]


def flag_order(oid: str, note: str) -> dict | None:
    """Gắn cờ 'cần xử lý' khi khách than phiền về đơn — hiện nổi bật ở admin UI."""
    with _conn() as c:
        c.execute("UPDATE orders SET flagged = 1, flag_note = ? WHERE id = ?", (note, oid))
    return get_order(oid)


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["items"] = json.loads(d.pop("items_json"))
    return d
