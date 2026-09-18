"""Hạ cấp message nội bộ của `engine.py` (kiểu Facebook Generic Template — carousel +
quick_replies) thành text+ảnh đơn giản cho Zalo cá nhân — Zalo không có carousel/nút
bấm thật, khách chỉ có thể gõ tay (đã có alias text tương ứng ở engine.handle()).

Hàm THUẦN, KHÔNG I/O: chỉ biến đổi `list[dict]` (output của `engine.handle()`/
`engine.handle_or_paused()`) thành `list[{"text": str, "image_url": str | None}]`, mỗi
phần tử = ĐÚNG 1 lần gửi. Việc gửi thật (tải ảnh theo URL, gọi Zalo) do sidecar
`commerce/zalo-bridge/` thực hiện qua endpoint relay `POST /channels/zalo/message`.
"""

from __future__ import annotations

# Trần số tin gửi ra mỗi lần trả lời (câu 18 — mặc định khớp trần carousel 10 phần tử
# của engine._show_products/_ai_reply, tránh spam quá nhiều tin liên tiếp trên Zalo).
MAX_SENDS = 10


def _generic_element_to_send(el: dict) -> dict:
    title = el.get("title", "") or ""
    subtitle = el.get("subtitle", "") or ""
    image_url = el.get("image_url")
    text = f"{title}\n{subtitle}" if subtitle else title
    if not image_url:
        # Store KHÔNG ảnh (vd 'chao'): mã sản phẩm chỉ nằm trong buttons[0].payload dạng
        # "PROD::<code>", subtitle KHÔNG có mã (khác store CÓ ảnh, subtitle đã chứa
        # "Mã: <code>" — xem engine._product_card) -> chèn thêm để khách Zalo biết mã mà
        # gõ tay đặt (Zalo không có nút bấm PROD::<code>).
        buttons = el.get("buttons") or []
        payload = buttons[0].get("payload", "") if buttons else ""
        if payload.startswith("PROD::"):
            code = payload[len("PROD::"):]
            if code:
                text = f"{text}\nMã: {code}"
    return {"text": text, "image_url": image_url}


def to_zalo_sends(messages: list[dict]) -> list[dict]:
    """messages: output của `engine.handle()`/`engine.handle_or_paused()`. Trả về
    `list[{"text": str, "image_url": str | None}]`, 1 phần tử = 1 lần gửi.

    Quy tắc:
    - type == "text": 1 entry, image_url=None. Bỏ `quick_replies` (câu 13 — Zalo cá nhân
      không có nút, khách gõ tay + đã có alias text ở engine.handle()).
    - type == "generic": 1 entry/phần tử (KHÔNG gộp) — xem `_generic_element_to_send`.
    - Áp trần `MAX_SENDS` (câu 18) trước khi trả — không spam quá nhiều tin/lần.
    """
    sends: list[dict] = []
    for m in messages:
        if len(sends) >= MAX_SENDS:
            break
        if m.get("type") == "generic":
            for el in m.get("elements", []):
                if len(sends) >= MAX_SENDS:
                    break
                sends.append(_generic_element_to_send(el))
        else:
            sends.append({"text": m.get("text", ""), "image_url": None})
    return sends[:MAX_SENDS]
