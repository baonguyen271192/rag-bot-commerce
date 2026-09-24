"""Mã hoá/giải mã credentials channel (Q2 trong kế hoạch DB hoá) — Fernet
(`cryptography`), key đọc từ biến môi trường `CREDENTIALS_KEY`.

Key KHÔNG lưu trong repo, KHÔNG lưu trong DB — chỉ ở env của máy chủ vận hành.
Thiếu/rỗng/sai format -> raise NGAY lúc import module này (fail-fast), để app
raise lúc khởi động (xem `main.py` import module này sớm) thay vì đợi tới
request đầu tiên chạm credentials mới lộ ra lỗi.

CẢNH BÁO vận hành: mất `CREDENTIALS_KEY` = mất khả năng giải mã TOÀN BỘ
credentials mọi channel đã lưu (không có cách khôi phục nếu không backup key)
— xem cảnh báo chi tiết trong `commerce/README.md`.
"""
from __future__ import annotations

import json
import os

from cryptography.fernet import Fernet, InvalidToken

_KEY = os.getenv("CREDENTIALS_KEY", "").strip()
if not _KEY:
    raise RuntimeError(
        "CREDENTIALS_KEY chưa được cấu hình — không thể mã hoá/giải mã credentials "
        "channel (Fernet). Sinh 1 key mới rồi đặt vào biến môi trường CREDENTIALS_KEY:\n"
        '  python3 -c "from cryptography.fernet import Fernet; '
        'print(Fernet.generate_key().decode())"'
    )

try:
    _fernet = Fernet(_KEY.encode("utf-8"))
except Exception as e:  # format sai (không phải Fernet key hợp lệ — urlsafe base64 32 byte)
    raise RuntimeError(
        f"CREDENTIALS_KEY không hợp lệ (phải là Fernet key, urlsafe base64 32 byte): {e}"
    ) from e


def encrypt(plaintext: str) -> str:
    """Mã hoá 1 chuỗi -> ciphertext (chuỗi, an toàn để lưu trực tiếp vào cột TEXT)."""
    return _fernet.encrypt((plaintext or "").encode("utf-8")).decode("utf-8")


def decrypt(token: str) -> str:
    """Giải mã ciphertext -> chuỗi gốc. Rỗng/None -> trả '' (không có gì để giải mã).
    Token hỏng/khác key (CREDENTIALS_KEY đã đổi) -> raise lỗi RÕ RÀNG, không nuốt lỗi
    (đọc nhầm dữ liệu channel im lặng nguy hiểm hơn crash)."""
    if not token:
        return ""
    try:
        return _fernet.decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken as e:
        raise RuntimeError(
            "Không giải mã được credentials channel — CREDENTIALS_KEY hiện tại khác với "
            "key lúc mã hoá (key sai/đã đổi), hoặc dữ liệu đã hỏng."
        ) from e


def encrypt_dict(d: dict) -> str:
    """Gói 1 dict field SECRET của 1 channel (vd {'page_token': '...'}) thành 1 chuỗi
    ciphertext duy nhất — khớp với cột `channels.credentials` (1 cột TEXT/channel)."""
    return encrypt(json.dumps(d or {}, ensure_ascii=False))


def decrypt_dict(s: str) -> dict:
    """Ngược lại `encrypt_dict()`. Chuỗi rỗng/None -> {} (channel chưa có secret nào)."""
    if not s:
        return {}
    return json.loads(decrypt(s))
