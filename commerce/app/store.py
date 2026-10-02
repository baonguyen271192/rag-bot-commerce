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
    # Seed 3 cửa hàng builtin (default/shop2/chao) nếu DB còn trống — cần thiết trên môi
    # trường mới (đĩa Render reset mỗi lần deploy), an toàn gọi lại nhiều lần (mỗi store
    # tự bỏ qua nếu đã tồn tại, xem scripts/migrate_to_db.py).
    from .scripts.migrate_to_db import _seed_stores
    _seed_stores()


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


def unflag_order(oid: str) -> dict | None:
    """Gỡ cờ 'cần xử lý' sau khi nhân viên đã xử lý xong — xem repository.unflag_order()."""
    return repository.unflag_order(oid)


def create_retail_order_with_promos(items: list, subtotal: int, customer: dict, payment: str,
                                     channel: str, created_at: str, store_id: str,
                                     has_size: bool, coupon_code: str | None = None,
                                     points_to_redeem: int = 0) -> tuple[dict | None, dict | None]:
    """Như `create_retail_order_checked`, cộng thêm mã giảm giá + đổi điểm tích luỹ — xem
    `repository.create_order_with_promos` để biết chi tiết cơ chế atomic/chống race."""
    return repository.create_order_with_promos(
        items=items, subtotal=subtotal, customer=customer, payment=payment,
        channel=channel, created_at=created_at, store_id=store_id, has_size=has_size,
        coupon_code=coupon_code, points_to_redeem=points_to_redeem,
    )


def get_coupon(store_id: str, code: str) -> dict | None:
    return repository.get_coupon(store_id, code)


def calc_coupon_discount(coupon_row: dict, subtotal: int) -> int:
    return repository.calc_coupon_discount(coupon_row, subtotal)


def list_coupons(store_id: str) -> list[dict]:
    return repository.list_coupons(store_id)


def create_coupon(store_id: str, code: str, type_: str, value: int,
                   max_uses: int | None, expires_at: str | None) -> dict:
    return repository.create_coupon(store_id, code, type_, value, max_uses, expires_at)


def update_coupon(store_id: str, code: str, patch: dict) -> dict | None:
    return repository.update_coupon(store_id, code, patch)


def delete_coupon(store_id: str, code: str) -> None:
    repository.delete_coupon(store_id, code)


def get_customer(store_id: str, phone: str) -> dict | None:
    return repository.get_customer(store_id, phone)


def list_customers(store_id: str) -> list[dict]:
    return repository.list_customers(store_id)


def set_order_payment_status(oid: str, payment_status: str) -> dict | None:
    return repository.set_order_payment_status(oid, payment_status)


def adjust_stock_qty(store_id: str, code: str, delta: int, reason: str = "manual_adjust") -> None:
    repository.adjust_stock_qty(store_id, code, delta, reason)


def now_iso() -> str:
    return repository.now_iso()


def log_conversation_turn(store_id: str, channel: str, sender_id: str,
                           inbound_text: str, received_at: str,
                           outbound: list[dict]) -> None:
    """Ghi 1 lượt hội thoại khách<->bot — xem `repository.log_conversation_turn`."""
    repository.log_conversation_turn(store_id, channel, sender_id, inbound_text,
                                      received_at, outbound)


def list_conversation_threads(store_id: str) -> list[dict]:
    return repository.list_conversation_threads(store_id)


def list_conversation_messages(store_id: str, channel: str, sender_id: str) -> list[dict]:
    return repository.list_conversation_messages(store_id, channel, sender_id)
