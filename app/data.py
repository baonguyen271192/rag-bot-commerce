"""Dữ liệu demo cho Commerce (bot đặt đơn đa cửa hàng).

Đây LÀ BẢN SAO ĐỘC LẬP của catalog demo (không import từ BQ) — nhân bản dữ liệu
tĩnh để service này triển khai/tách khỏi BQ hoàn toàn. Khi lên production, mỗi
cửa hàng (tenant) sẽ có catalog riêng lấy từ DB/API thật, thay cho catalog demo
258 mẫu này (xem stores.py).
"""

from .catalog import PRODUCTS, CATEGORIES  # noqa: E402


def vnd(n: int) -> str:
    """Định dạng tiền VND: 450000 -> '450.000₫'."""
    return f"{n:,.0f}".replace(",", ".") + "₫"
