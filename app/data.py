"""Dữ liệu demo cho Commerce (bot đặt đơn đa cửa hàng).

Đây LÀ BẢN SAO ĐỘC LẬP của catalog demo (không import từ BQ) — nhân bản dữ liệu
tĩnh để service này triển khai/tách khỏi BQ hoàn toàn. Khi lên production, mỗi
cửa hàng (tenant) sẽ có catalog riêng lấy từ DB/API thật, thay cho catalog demo
258 mẫu này (xem stores.py).
"""

from datetime import datetime, timedelta, timezone

from .catalog import PRODUCTS, CATEGORIES  # noqa: E402

# Giờ Việt Nam CỐ ĐỊNH (UTC+7, không có DST) — KHÔNG dùng datetime.now()/time.strftime()
# trần (giờ hệ điều hành máy chủ) vì trên local máy vô tình đúng do múi giờ máy đặt sẵn
# VN, nhưng server thật (Render...) chạy UTC, khiến giờ tạo đơn/"hôm nay" bị lệch 7 tiếng
# (đơn đặt 11:27 sáng bị ghi 04:27) — bug tìm thấy khi khách hỏi lại giờ trên đơn thật.
_VN_TZ = timezone(timedelta(hours=7))


def now_vn() -> datetime:
    return datetime.now(_VN_TZ)


def vnd(n: int) -> str:
    """Định dạng tiền VND: 450000 -> '450.000₫'."""
    return f"{n:,.0f}".replace(",", ".") + "₫"
