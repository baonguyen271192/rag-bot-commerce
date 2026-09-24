"""Lớp gửi tin qua Zalo Official Account (OA) Send API.

[Chưa xác minh — câu 3 CÂU HỎI CÒN BỎ NGỎ] Repo KHÔNG có code Zalo OA nào trước đây
(đã grep xác nhận trong kế hoạch). Endpoint Send Message thật, format payload, giới hạn
rate limit và cách đính kèm ảnh của Zalo OA CHƯA có tài liệu chính thức được cấp — mọi
chi tiết dưới đây là PLACEHOLDER, KHÔNG phải field/endpoint thật, không được bịa ra.

Khung này chỉ tồn tại để `main.py` (webhook Zalo OA) có nơi gọi tới mà không vỡ import;
khi có tài liệu chính thức, thay `_SEND_URL` + payload thật vào đúng vị trí đã đánh dấu
TODO. Cách viết (adapter chuyển message nội bộ -> payload kênh, log khi thiếu token)
bám theo `commerce/app/messenger.py`.
"""

from __future__ import annotations

import httpx

# TODO(cần chốt câu 3): endpoint Send Message thật của Zalo OA — placeholder, CHƯA xác minh.
_SEND_URL = "https://openapi.zalo.me/v3.0/oa/message/cs"


def _to_zalo_oa_payload(user_id: str, message: dict) -> dict:
    """[Chưa xác minh — câu 3] Dịch message nội bộ engine ({type, text, quick_replies,
    elements}) sang payload Zalo OA. Placeholder: chỉ map phần text; carousel/ảnh (elements)
    CHƯA xác minh cách đính kèm thật của Zalo OA nên tạm bỏ qua (không bịa field)."""
    text = message.get("text", "")
    if message.get("type") == "generic":
        # TODO(cần chốt câu 3): cách đính kèm ảnh/carousel thật của Zalo OA — placeholder
        # hạ cấp về text để không vỡ khi có payload thật.
        text = "\n".join(
            f"{el.get('title', '')}\n{el.get('subtitle', '')}".strip()
            for el in message.get("elements", []))
    return {
        "recipient": {"user_id": user_id},
        "message": {"text": text},
    }


async def send(user_id: str, message: dict, channel_cfg: dict) -> None:
    """Gửi 1 message tới 1 user qua Zalo OA. Thiếu access token -> chỉ log (giống
    messenger.send() khi thiếu PAGE_ACCESS_TOKEN), không crash."""
    token = (channel_cfg or {}).get("oa_access_token")
    if not token:
        print(f"[zalo_oa] (no oa_access_token) -> {user_id}: {message.get('text', '')[:80]}")
        return
    payload = _to_zalo_oa_payload(user_id, message)
    # TODO(cần chốt câu 3): header/tham số auth thật (access_token ở query? header riêng?)
    # — placeholder theo kiểu phổ biến của Zalo OA API (access_token ở header).
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(_SEND_URL, headers={"access_token": token}, json=payload)
        if r.status_code >= 400:
            print(f"[zalo_oa] LỖI {r.status_code} -> {user_id}: {r.text}")
        else:
            print(f"[zalo_oa] ✓ GỬI OK -> {user_id}: {message.get('text', '[carousel]')[:60]}")


async def send_all(user_id: str, messages: list[dict], channel_cfg: dict) -> None:
    for m in messages:
        await send(user_id, m, channel_cfg)
