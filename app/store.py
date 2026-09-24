"""Kho đơn hàng của Commerce — đơn khách đặt qua bot, đa cửa hàng (store_id).

[1a — DB hoá] Ruột đã chuyển sang `repository.py` (Q3 — 1 file `.db` DUY NHẤT gộp cả
orders, không còn `orders.db` riêng/`_DB_PATH` riêng của module này). File này giờ là
FAÇADE: giữ nguyên chữ ký mọi hàm public (kể cả default `store_id="default"` — bỏ
default là việc của lượt 1b, KHÔNG làm ở đây) để `engine.py`/`main.py` không phải sửa.
"""

from __future__ import annotations

from . import repository


def init_db() -> None:
    repository.init_db()


def create_retail_order(items: list, subtotal: int, customer: dict, payment: str,
                        channel: str, created_at: str, store_id: str = "default") -> dict:
    """Tạo đơn khách đặt qua bot, KHÔNG kiểm tra/đụng tồn kho. customer = {name, phone,
    address, fb_psid?}. Giữ lại cho tương thích/kịch bản không cần kiểm tồn — luồng đặt
    hàng qua bot thật (`engine._submit`) dùng `create_retail_order_checked` bên dưới để
    tránh bán trùng size cuối cùng cho 2 khách cùng lúc."""
    return repository.create_order(
        items=items, subtotal=subtotal, customer=customer, payment=payment,
        channel=channel, created_at=created_at, store_id=store_id,
    )


def create_retail_order_checked(items: list, subtotal: int, customer: dict, payment: str,
                                 channel: str, created_at: str, store_id: str,
                                 has_size: bool) -> tuple[dict | None, list[dict] | None]:
    """Tạo đơn CÓ kiểm tra tồn kho (khi `has_size`) — trả (order, None) khi thành công,
    hoặc (None, shortages) khi có size không đủ hàng (không tạo đơn). Xem
    `repository.create_order_with_stock` để biết chi tiết cơ chế chống bán trùng."""
    return repository.create_order_with_stock(
        items=items, subtotal=subtotal, customer=customer, payment=payment,
        channel=channel, created_at=created_at, store_id=store_id, has_size=has_size,
    )


def get_order(oid: str, store_id: str | None = None) -> dict | None:
    return repository.get_order(oid, store_id)


def list_orders(store_id: str | None = None) -> list[dict]:
    return repository.list_orders(store_id)


def set_status(oid: str, status: str) -> dict | None:
    return repository.set_order_status(oid, status)


def list_orders_by_psid(psid: str | None, store_id: str | None = None) -> list[dict]:
    """Đơn gần nhất của 1 khách (theo PSID Messenger) — dùng để tự tra đơn khi khách
    than phiền, không cần khách gõ lại mã đơn."""
    return repository.list_orders_by_psid(psid, store_id)


def flag_order(oid: str, note: str) -> dict | None:
    """Gắn cờ 'cần xử lý' khi khách than phiền về đơn — hiện nổi bật ở admin UI."""
    return repository.flag_order(oid, note)
