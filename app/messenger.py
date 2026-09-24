"""Lớp gửi tin qua Facebook Messenger Send API.

Chuyển "message" nội bộ ({text, quick_replies}) thành payload Messenger và gọi
Graph API. Quick replies của engine -> quick_replies của Messenger (tối đa 13).
"""

from __future__ import annotations

import os
import httpx

GRAPH_URL = "https://graph.facebook.com/v21.0/me/messages"


def _elements_to_messenger(elements: list) -> list:
    out = []
    for el in elements:
        item = {"title": el["title"][:80]}
        if el.get("subtitle"):
            item["subtitle"] = el["subtitle"][:80]
        if el.get("image_url"):
            item["image_url"] = el["image_url"]
        if el.get("buttons"):
            item["buttons"] = [
                {"type": "postback", "title": b["title"][:20], "payload": b["payload"]}
                for b in el["buttons"][:3]
            ]
        if el.get("default_action"):
            # Bấm thẳng vào ẢNH/thẻ → mở link (Messenger chỉ hỗ trợ mở URL, không postback).
            item["default_action"] = el["default_action"]
        out.append(item)
    return out


def _to_messenger_payload(recipient_id: str, message: dict) -> dict:
    if message.get("type") == "generic":
        m = {"attachment": {"type": "template", "payload": {
            "template_type": "generic",
            "elements": _elements_to_messenger(message["elements"][:10]),
        }}}
    else:
        m = {"text": message.get("text", "")}
    qrs = message.get("quick_replies")
    if qrs:
        m["quick_replies"] = [
            {"content_type": "text", "title": q["title"][:20], "payload": q["payload"]}
            for q in qrs[:13]
        ]
    return {"recipient": {"id": recipient_id}, "message": m,
            "messaging_type": "RESPONSE"}


async def send(recipient_id: str, message: dict, token: str | None = None) -> None:
    # token của ĐÚNG Fanpage (đa cửa hàng); fallback .env cho tương thích 1 shop.
    token = token or os.environ.get("PAGE_ACCESS_TOKEN")
    if not token:
        # chế độ chưa cấu hình token: chỉ log, tránh crash (hữu ích khi test webhook)
        print(f"[messenger] (no token) -> {recipient_id}: {message.get('text','')[:80]}")
        return
    payload = _to_messenger_payload(recipient_id, message)
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(GRAPH_URL, params={"access_token": token}, json=payload)
        if r.status_code >= 400:
            print(f"[messenger] LỖI {r.status_code} -> {recipient_id}: {r.text}")
        else:
            print(f"[messenger] ✓ GỬI OK -> {recipient_id}: {message.get('text','[carousel]')[:60]}")


async def send_all(recipient_id: str, messages: list[dict], token: str | None = None) -> None:
    for m in messages:
        await send(recipient_id, m, token)
