"""Auth phiên đăng nhập cho self-service portal (chủ shop tự cấu hình store của mình,
tách khỏi super admin quản lý toàn hệ thống).

Cookie httpOnly mã hoá bằng Fernet — CÙNG PATTERN `crypto.py` dùng cho channel
credentials (key riêng, fail-fast nếu thiếu, sinh key bằng đúng 1 dòng lệnh), nhưng CỐ
Ý dùng khoá RIÊNG `SESSION_KEY` (không dùng chung `CREDENTIALS_KEY`) — xoay 1 khoá không
ép logout toàn bộ người dùng và ngược lại, 2 rủi ro vận hành khác nhau không nên chung 1
khoá.

Vì sao Fernet mà không phải JWT (PyJWT): payload được MÃ HOÁ thật (không chỉ base64 như
JWT), nên role/tenant_id không lộ ra dù ai đó đọc được cookie; Fernet có sẵn kiểm tra hết
hạn theo TTL lúc decrypt() — khỏi tự cài đặt logic "exp" tay dễ sai; và không cần thêm
dependency nào (cryptography đã có sẵn qua crypto.py). Không có nhu cầu 1 service khác
verify token độc lập (chỉ đúng process FastAPI này phát + kiểm token), nên JWT không có
lợi thế thật nào ở đây.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import uuid

from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, HTTPException, Request

from . import plans, repository

COOKIE_NAME = "commerce_session"
SESSION_TTL_SECONDS = 12 * 3600

_SESSION_KEY = os.getenv("SESSION_KEY", "").strip()
if not _SESSION_KEY:
    raise RuntimeError(
        "SESSION_KEY chưa được cấu hình — không thể ký/giải mã cookie phiên đăng nhập. "
        "Sinh 1 key mới rồi đặt vào biến môi trường SESSION_KEY:\n"
        '  python3 -c "from cryptography.fernet import Fernet; '
        'print(Fernet.generate_key().decode())"'
    )

try:
    _fernet = Fernet(_SESSION_KEY.encode("utf-8"))
except Exception as e:
    raise RuntimeError(
        f"SESSION_KEY không hợp lệ (phải là Fernet key, urlsafe base64 32 byte): {e}"
    ) from e

_PBKDF2_ITERATIONS = 390_000


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS)
    return f"{_PBKDF2_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        iterations_s, salt_hex, hash_hex = stored.split("$")
    except ValueError:
        return False
    dk = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations_s))
    return hmac.compare_digest(dk.hex(), hash_hex)


def create_session_token(user: dict) -> str:
    payload = {"uid": user["id"], "role": user["role"], "tenant_id": user.get("tenant_id"),
               "email": user["email"]}
    return _fernet.encrypt(json.dumps(payload, ensure_ascii=False).encode("utf-8")).decode("utf-8")


def decode_session_token(token: str) -> dict | None:
    try:
        raw = _fernet.decrypt(token.encode("utf-8"), ttl=SESSION_TTL_SECONDS)
    except InvalidToken:
        return None
    return json.loads(raw)


# ---------------- FastAPI dependencies ----------------

def get_current_user(request: Request) -> dict:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(401, "Chưa đăng nhập")
    user = decode_session_token(token)
    if user is None:
        raise HTTPException(401, "Phiên đăng nhập hết hạn hoặc không hợp lệ")
    return user


def require_super_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "super_admin":
        raise HTTPException(403, "Chỉ super admin mới được thao tác này")
    return user


def require_store_access(sid: str, user: dict = Depends(get_current_user)) -> dict:
    """Dùng làm Depends() trên mọi route path có {sid}. super_admin đi qua mọi store;
    tenant_owner chỉ đi qua store thuộc đúng tenant_id của mình. Store thuộc tenant KHÁC
    (hoặc không tồn tại) đều trả 404 như nhau — không phân biệt 403/404 để không lộ việc
    store đó có tồn tại hay không (khách tenant khác dò mã cửa hàng người khác)."""
    row = repository.get_store_row(sid)
    if not row:
        raise HTTPException(404, "Cửa hàng không tồn tại")
    if user["role"] != "super_admin" and row["tenant_id"] != user.get("tenant_id"):
        raise HTTPException(404, "Cửa hàng không tồn tại")
    return user


def require_store_access_qs(store_id: str, user: dict = Depends(get_current_user)) -> dict:
    """Như require_store_access nhưng đọc `store_id` từ QUERY PARAM thay vì path param
    {sid} — dùng cho /api/orders* (store_id truyền qua ?store_id=...)."""
    return require_store_access(store_id, user)


def require_order_access(oid: str, user: dict = Depends(get_current_user)) -> dict:
    """Đơn hàng được tra theo `oid` một mình, không kèm store_id trên path — phải tự tra
    ngược store_id của đơn rồi áp đúng luật tenant như require_store_access, nếu không
    tenant_owner đã đăng nhập hợp lệ cho CHÍNH store của họ vẫn có thể sửa đơn của tenant
    khác chỉ bằng cách đoán đúng mã đơn (mã đơn hiện là số tăng dần, dễ đoán)."""
    order = repository.get_order(oid)
    if not order:
        raise HTTPException(404, "Đơn hàng không tồn tại")
    require_store_access(order["store_id"], user)
    return user


def require_feature(store_id: str, feature_key: str) -> None:
    """KHÔNG dùng qua Depends() — gọi TRỰC TIẾP trong route handler, vì điều kiện gate
    (vd chỉ chặn khi ctype=='zalo_personal' VÀ body.enabled=True) phụ thuộc giá trị cụ
    thể trong body của request, không áp dụng cho MỌI request tới route đó."""
    row = repository.get_store_row(store_id)
    tenant = repository.get_tenant(row["tenant_id"]) if row else None
    plan_id = (tenant or {}).get("plan_id", plans.DEFAULT_PLAN)
    if not plans.has_feature(plan_id, feature_key):
        raise HTTPException(
            403, f"Gói hiện tại chưa bao gồm '{feature_key}' — nâng cấp gói để dùng tính năng này.")
