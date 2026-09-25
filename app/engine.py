"""Bộ não hội thoại của bot Commerce (đặt đơn) — đa cửa hàng, đa ngành.

Phục vụ KHÁCH (không có khái niệm đại lý/công nợ):
  - Giá lẻ, không hạn mức, không cần duyệt.
  - Thu thập Tên → SĐT → Địa chỉ → chọn COD/Chuyển khoản → tạo đơn ngay.
  - Mỗi cửa hàng (store_id) có catalog/tone/chính sách riêng — xem stores.py.
  - Tự thích ứng ngành: có size (giày) hay theo phần (quán ăn) — xem stores "has_size".

Thiết kế tách khỏi kênh gửi tin: handle(sender_id, text, store_id, channel) trả về danh
sách "message" trung lập kênh. main.py (webhook Facebook, relay Zalo cá nhân, webhook
Zalo OA) và trình giả lập web dùng chung handle() này; `channel` chỉ dùng để (a) tách
session theo kênh (xem _session()) và (b) ghi đúng cột `channel` khi tạo đơn — KHÔNG đổi
logic hội thoại. Thêm kênh mới chỉ cần gọi handle()/handle_or_paused() với channel tương
ứng rồi tự chuyển đổi định dạng gửi (xem zalo_adapter.py cho Zalo cá nhân).

Lai (hybrid): các bước duyệt/menu, nếu khách gõ tự do không khớp nút → route sang
assistant.answer_retail() để TƯ VẤN (giá, còn hàng, ship, thanh toán) rồi nhắc quay
lại nút đặt hàng. KHÔNG route khi đang nhập Tên/SĐT/Địa chỉ (text đó là dữ liệu đơn).

Trạng thái hội thoại lưu RAM theo (store_id, channel, sender_id) (demo).
"""

from __future__ import annotations

import os
import re
import threading
import unicodedata

from . import data, store, assistant, stores

# URL public của web app (qua tunnel) — để bấm ảnh trên Messenger mở trang sản phẩm
# có gallery đầy đủ. Đặt trong .env: PUBLIC_BASE_URL=https://....trycloudflare.com
# Đọc lúc GỌI (không phải import) vì load_dotenv() chạy sau khi import engine.
def _public_base() -> str:
    return os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")

SESSIONS: dict[str, dict] = {}

# 1 khoá/phiên — chỉ dùng để chặn CÙNG 1 phiên bị xử lý "Gửi đơn" 2 LẦN chồng nhau thật
# sự đồng thời (vd webhook gửi lại sự kiện y hệt trước khi lượt xử lý đầu kịp xoá giỏ
# hàng) — không phải khoá chung, không ảnh hưởng khách khác. Không dọn dẹp theo thời
# gian (demo, giống SESSIONS) — chấp nhận được ở quy mô hiện tại.
_SUBMIT_LOCKS: dict[str, threading.Lock] = {}


def _submit_lock(key: str) -> threading.Lock:
    lock = _SUBMIT_LOCKS.get(key)
    if lock is None:
        lock = _SUBMIT_LOCKS[key] = threading.Lock()
    return lock

# Lời chào — luôn đưa khách về menu chính dù đang kẹt ở bước nào (tránh gõ "hi" bị
# hiểu nhầm là nhập size khi đang ở trạng thái SIZE_INPUT).
GREETINGS = ("hi", "hello", "hello", "henlo", "hí", "chào", "chao", "xin chào",
             "xin chao", "alo", "a lô", "hey", "shop ơi", "shop oi", "shop")


def _is_greeting(low: str) -> bool:
    """Nhận diện lời chào linh hoạt hơn — không chỉ khớp CHÍNH XÁC cả câu ('hi'/'chào'),
    mà cả khi có thêm từ gọi ngắn phía sau ('hi ad', 'chào shop ơi', 'xin chào shop').
    So khớp theo TIỀN TỐ (không chỉ từ đầu tiên) vì lời chào có thể 2 từ ('xin chào') —
    lấy đúng từ chào dài nhất khớp trước để không bị 1 từ chào ngắn hơn cắt hụt phần
    còn lại. Phần còn lại phải ngắn (≤2 từ, chỉ là từ gọi) mới tính là chào thuần."""
    if low in GREETINGS:
        return True
    for g in sorted(GREETINGS, key=len, reverse=True):
        if low.startswith(g + " "):
            rest = low[len(g):].strip()
            if len(rest.split()) <= 2:
                return True
    return False


def _looks_like_offtopic(text: str) -> bool:
    """Câu hỏi/lan man chen ngang lúc đang ở state INFO (thu thập họ tên/SĐT/địa chỉ)
    — KHÔNG được nuốt làm tên/địa chỉ. Bug tìm thấy khi test thật: khách hỏi "ship bao
    lâu vậy shop" giữa lúc đang điền thông tin bị hiểu nhầm thành tên người nhận, câu
    hỏi không được trả lời. Tên/địa chỉ thật rất ngắn, không có dấu "?", không tự nhắc
    tới "shop" (khách không xưng hô vậy khi khai tên/địa chỉ của chính họ)."""
    if "?" in text:
        return True
    if len(text.split()) > 8:
        return True
    s = assistant._strip(text)
    return any(k in s for k in ("shop", "bao lau", "bao nhieu tien", "the nao", "vay a"))


def _new_session(store_id: str = "default") -> dict:
    return {"state": "START", "cart": [], "pending_product": None,
            "customer": {"name": "", "phone": "", "address": ""},
            "payment": None, "my_orders": [], "store_id": store_id,
            "last_shown": []}  # mã các sản phẩm vừa hiện carousel — để đoán mã gõ tắt


def _session(sender_id: str, store_id: str = "default", channel: str = "facebook") -> dict:
    # Khoá phiên theo (store, KÊNH, người gửi) — không chỉ (store, người gửi). FB PSID và
    # Zalo user id là 2 không gian định danh khác nhau nhưng đều là chuỗi số, có thể
    # TRÙNG số giữa 2 kênh; thiếu chiều "kênh" trong key sẽ khiến 2 khách khác kênh (vô
    # tình cùng id) dùng CHUNG session/giỏ hàng của nhau (câu 7, chọn phương án A).
    key = f"{store_id}:{channel}:{sender_id}"
    if key not in SESSIONS:
        SESSIONS[key] = _new_session(store_id)
        SESSIONS[key]["_key"] = key
    return SESSIONS[key]


def _prods(sess: dict) -> dict:
    return stores.products(sess.get("store_id"))


def _store(sess: dict) -> dict:
    return stores.get(sess.get("store_id"))


def _unit(sess: dict) -> str:
    return _store(sess).get("unit", "đôi")


def _has_size(sess: dict) -> bool:
    return _store(sess).get("has_size", True)


def _qty_detail(item: dict, sess: dict) -> str:
    """Mô tả số lượng theo ngành: giày → 'size 33×2'; quán ăn → '2 phần'."""
    if _has_size(sess):
        return "size " + ", ".join(f"{s}×{q}" for s, q in item["sizes"].items())
    return f"{item['qty_total']} {_unit(sess)}"


def _item_label(item: dict) -> str:
    """Tên item kèm màu (nếu có) — nhiều màu dùng CHUNG 1 tên sản phẩm, thiếu màu ở
    giỏ hàng/xác nhận đơn/tra đơn thì không biết khách đặt đúng màu nào."""
    color = item.get("color")
    return f"{item['name']} (màu {color})" if color else item["name"]


def _msg(text: str, quick_replies=None) -> dict:
    m = {"type": "text", "text": text}
    if quick_replies:
        m["quick_replies"] = [{"title": t, "payload": p} for t, p in quick_replies]
    return m


def _product_carousel(elements: list, quick_replies=None) -> dict:
    m = {"type": "generic", "elements": elements}
    if quick_replies:
        m["quick_replies"] = [{"title": t, "payload": p} for t, p in quick_replies]
    return m


def _product_card(p: dict, unit: str = "đôi") -> dict:
    """Thẻ sản phẩm/món dùng GIÁ LẺ. Có ảnh → bấm ảnh xem to; không ảnh (quán ăn) → chỉ nút Chọn."""
    color = f" · Màu {p['color']}" if p.get("color") else ""
    card = {
        "title": p["name"],
        "subtitle": f"Giá: {data.vnd(p['retail'])}/{unit}{color}",
        # Hiện ĐÚNG mã trên nút (không thêm chữ "Chọn"/emoji) — mã dạng MÃGỐC-MÀU dài
        # tối đa 16 ký tự, cộng thêm "🛒 Chọn " sẽ vượt giới hạn 20 ký tự của nút
        # Messenger và bị cắt mất chữ cuối; để mã trần thì luôn an toàn.
        "buttons": [{"title": "🛒 Chọn món" if not p.get("image") else p["code"],
                     "payload": f"PROD::{p['code']}"}],
    }
    if p.get("image"):
        card["subtitle"] = f"Mã: {p['code']}{color} · Giá: {data.vnd(p['retail'])}/{unit} · 👆 bấm ảnh để xem to"
        card["image_url"] = p["image"]
        card["default_action"] = {"type": "web_url", "url": p["image"], "webview_height_ratio": "full"}
    return card


def _show_product_images(code: str, store_id: str = "default") -> list[dict]:
    """Gửi các ảnh chi tiết (gallery) của 1 mẫu dưới dạng carousel ảnh."""
    p = stores.products(store_id).get(code.upper())
    if not p:
        return [_msg("Dạ không tìm thấy mẫu này ạ.")]
    imgs = p.get("images") or [p.get("image")]
    unit = stores.get(store_id).get("unit", "đôi")
    elements = [{
        "title": f"{p['name']} — ảnh {i + 1}/{len(imgs)}",
        "subtitle": f"Giá: {data.vnd(p['retail'])}/{unit}",
        "image_url": img,
        "buttons": [{"title": "🛒 Chọn mẫu này", "payload": f"PROD::{p['code']}"}],
    } for i, img in enumerate(imgs[:10])]
    return [_msg(f"📸 Ảnh chi tiết *{p['name']}*:"), _product_carousel(elements)]


# ---------------- Các bước hiển thị ----------------

_MENU_QR = [("🛒 Xem sản phẩm", "MENU_ORDER"),
            ("📝 Giỏ hàng", "MENU_CART"),
            ("🔎 Tra đơn", "MENU_TRACK")]


def _welcome(store_id: str = "default") -> list[dict]:
    # Một tin chào ấm áp, kèm sẵn nút — không lặp thêm câu "muốn làm gì".
    label = stores.get(store_id).get("shop_label", "Shop Giày BQ")
    return [_msg(
        f"👋 *{label}* xin chào anh/chị ạ!\n"
        "Em là trợ lý bán hàng, sẵn sàng giúp anh/chị chọn và đặt hàng giao tận nơi. "
        "Bấm nút bên dưới để bắt đầu xem hàng, hoặc nhắn em về món / giá / ship nhé!",
        _MENU_QR)]


def _main_menu() -> list[dict]:
    return [_msg("Em có thể giúp gì cho anh/chị ạ? 👇", _MENU_QR)]


def _show_categories(store_id: str = "default") -> list[dict]:
    qr = [(c, f"CAT::{c}") for c in stores.categories(store_id)]
    return [_msg("Chọn nhóm hàng anh/chị quan tâm:", qr)]


def _show_products(cat: str, store_id: str = "default", sess: dict | None = None) -> list[dict]:
    prods = [p for p in stores.products(store_id).values() if p["category"] == cat]
    if not prods:
        return [_msg("Nhóm này tạm chưa có mẫu nào.", [("🛒 Nhóm khác", "MENU_ORDER")])]
    unit = stores.get(store_id).get("unit", "đôi")
    shown = prods[:10]                                   # Messenger tối đa 10 thẻ/carousel
    more = len(prods) - len(shown)
    if sess is not None:
        sess["last_shown"] = [p["code"] for p in shown]
    elements = [_product_card(p, unit) for p in shown]
    note = f" (còn {more} mẫu nữa — anh/chị nhắn tên cần tìm nhé)" if more > 0 else ""
    intro = _msg(f"📦 *{cat}* — mời anh/chị chọn{note}. Bấm *🛒 Chọn* trên mục anh/chị thích:")
    return [intro, _product_carousel(elements)]


def _show_size_grid(sess: dict, code: str) -> list[dict]:
    p = _prods(sess)[code]
    sess["pending_product"] = code
    sess["state"] = "SIZE_INPUT"
    color = f" · Màu {p['color']}" if p.get("color") else ""
    card = _product_carousel([{
        "title": p["name"],
        "subtitle": f"Giá: {data.vnd(p['retail'])}/{_unit(sess)}{color}",
        "image_url": p.get("image"),
    }])
    # Khách lẻ: chỉ cần biết SIZE NÀO CÒN, không cần số tồn kho cụ thể.
    in_stock = [s for s, stock in p["sizes"].items() if stock > 0]
    out = [s for s, stock in p["sizes"].items() if stock == 0]
    unit = _unit(sess)
    lines = ["📏 Còn size: " + (", ".join(in_stock) if in_stock else "tạm hết ạ")]
    if out:
        lines.append("(Tạm hết: " + ", ".join(out) + ")")
    # Ví dụ theo ĐÚNG size còn hàng của mẫu (không hardcode).
    e1 = in_stock[0] if in_stock else "39"
    e2 = in_stock[1] if len(in_stock) >= 2 else e1
    lines.append(f"\nAnh/chị muốn mua size nào, mấy {unit} ạ? Nhắn cho em, ví dụ:")
    lines.append(f"• `{e1}` — size {e1}, 1 {unit}")
    lines.append(f"• `{e1} lấy 2 {unit}` — size {e1}, 2 {unit}")
    lines.append(f"• `{e1}:1, {e2}:2` — nhiều size một lần")
    qr = [("🔙 Đổi sản phẩm", "MENU_ORDER"), ("📋 Menu", "MENU")]
    return [card, _msg("\n".join(lines), qr)]


# Số đếm viết bằng chữ (0-10) — khách lớn tuổi/quen gõ chữ hơn bấm số thường trả lời
# "hai phần" thay vì "2"; chỉ tìm số thuần regex \d+ sẽ bỏ sót hoàn toàn các câu này.
# Khoá đã qua assistant._strip (bỏ dấu, lowercase) nên viết KHÔNG dấu.
_SO_CHU = {"khong": 0, "mot": 1, "hai": 2, "ba": 3, "bon": 4, "nam": 5,
           "sau": 6, "bay": 7, "tam": 8, "chin": 9, "muoi": 10}


def _word_to_qty(text: str) -> int:
    """Tìm SỐ ĐẦU TIÊN viết bằng chữ trong câu, 0 nếu không có (để nơi gọi coi là
    'chưa hợp lệ' giống hệt trường hợp không tìm thấy chữ số)."""
    for tok in assistant._strip(text).split():
        if tok in _SO_CHU:
            return _SO_CHU[tok]
    return 0


def _parse_size_qty(text: str) -> tuple[dict, list[str]]:
    """'40:2, 41:1' -> ({'40':2,'41':1}, []). Phần đọc không được trả riêng."""
    out, bad = {}, []
    for part in re.split(r"[,\n;]+", text):
        part = part.strip()
        if not part:
            continue
        m = re.match(r"\s*(\w+)\s*[:x=]\s*(\d+)\s*$", part)
        if m:
            out[m.group(1)] = int(m.group(2))
        else:
            bad.append(part)
    return out, bad


def _qty_already_in_cart(cart: list, code: str, size: str) -> int:
    return sum(it["sizes"].get(size, 0) for it in cart if it["code"] == code)


def _add_to_cart(sess: dict, code: str, qtys: dict, bad_parts: list[str] | None = None) -> list[dict]:
    p = _prods(sess)[code]
    cart = sess["cart"]
    unit = p["retail"]                                    # <-- giá lẻ
    unit_label = _unit(sess)
    errors, valid = [f"Không đọc được: `{b}`." for b in (bad_parts or [])], {}
    for size, qty in qtys.items():
        if size not in p["sizes"]:
            errors.append(f"mẫu này không có size {size}")
            continue
        stock = p["sizes"][size]
        remaining = stock - _qty_already_in_cart(cart, code, size)
        if stock == 0:
            errors.append(f"size {size} tạm hết hàng")
        elif qty > remaining:
            errors.append(f"size {size} chỉ còn {remaining} {unit_label} thôi ạ")
        elif qty > 0:
            valid[size] = qty
    if not valid:
        avail = [s for s, st in p["sizes"].items() if st > 0]
        ex = avail[0] if avail else "39"
        msg = "Dạ chưa thêm được ạ" + (" (" + "; ".join(errors) + ")" if errors else "") + "."
        return [_msg(msg + f"\nAnh/chị nhắn lại giúp em nhé, ví dụ `{ex}` (size {ex}, 1 {unit_label}) hoặc `{ex} lấy 2 {unit_label}`.")]

    existing = next((it for it in cart if it["code"] == code), None)
    if existing:
        for size, qty in valid.items():
            existing["sizes"][size] = existing["sizes"].get(size, 0) + qty
        existing["qty_total"] = sum(existing["sizes"].values())
        existing["line_total"] = existing["qty_total"] * existing["unit_price"]
    else:
        qty_total = sum(valid.values())
        cart.append({"code": code, "name": p["name"], "color": p.get("color", ""),
                     "sizes": dict(valid), "unit_price": unit, "qty_total": qty_total,
                     "line_total": qty_total * unit})

    sess["state"] = "CART"
    detail = ", ".join(f"{s}×{q}" for s, q in valid.items())
    added_total = sum(valid.values()) * unit
    note = ("\n⚠️ " + " ".join(errors)) if errors else ""
    # Nêu rõ mã + màu — nhiều màu dùng CHUNG 1 tên sản phẩm (chỉ khác field 'color'),
    # thiếu mã/màu khách/shop không biết vừa thêm đúng màu nào vào giỏ.
    color = f" · Màu {p['color']}" if p.get("color") else ""
    qr = [("✅ Đặt hàng", "CHECKOUT"), ("➕ Thêm sản phẩm", "MENU_ORDER"),
          ("📝 Giỏ hàng", "MENU_CART")]
    return [_msg(
        f"✔️ Đã thêm *{p['name']}*\n"
        f"Mã {p['code']}{color}\n"
        f"Size {detail} · {data.vnd(unit)}/{_unit(sess)}\n"
        f"Thành tiền: *{data.vnd(added_total)}*.{note}\nBấm nút bên dưới để tiếp tục nhé.", qr)]


def _show_qty(sess: dict, code: str) -> list[dict]:
    """Quán ăn: chọn món xong hỏi SỐ PHẦN (không có size)."""
    p = _prods(sess)[code]
    sess["pending_product"] = code
    sess["state"] = "QTY_INPUT"
    unit = _unit(sess)
    qr = [("🔙 Đổi món", "MENU_ORDER"), ("📋 Menu", "MENU")]
    return [_msg(f"Dạ *{p['name']}* — {data.vnd(p['retail'])}/{unit} ạ.\n"
                 f"Anh/chị muốn mấy {unit}? Nhắn số lượng giúp em nhé (ví dụ: `2`).", qr)]


# Ngưỡng số lượng "bất thường" cho 1 lần thêm giỏ — KHÔNG chặn, chỉ hỏi xác nhận lại,
# vì trước đây số lớn hơn 99 bị ÂM THẦM cắt về 99 (khách gõ nhầm '500' tưởng đặt 5 phần
# thì bị lặng lẽ đổi thành 99 mà không hề biết) — rất dễ tạo đơn sai số lượng lớn mà
# không ai kịp phát hiện trước khi hàng đã được xác nhận.
_QTY_CONFIRM_THRESHOLD = 30


def _add_food_to_cart(sess: dict, code: str, qty: int, confirmed: bool = False) -> list[dict]:
    p = _prods(sess)[code]
    unit = _unit(sess)
    if qty <= 0:
        return [_msg(f"Dạ số lượng chưa hợp lệ ạ. Anh/chị nhắn số {unit} muốn đặt nhé (ví dụ: `2`).")]
    if qty > _QTY_CONFIRM_THRESHOLD and not confirmed:
        return [_msg(
            f"Dạ anh/chị muốn đặt *{qty} {unit}* {p['name']} thật ạ? Số này khá nhiều 😅\n"
            f"Đúng thì nhắn `xác nhận {qty}` giúp em; nếu gõ nhầm số thì nhắn lại số khác nhé.")]
    cart = sess["cart"]
    price = p["retail"]
    existing = next((it for it in cart if it["code"] == code), None)
    if existing:
        existing["qty_total"] += qty
        existing["sizes"] = {"": existing["qty_total"]}
        existing["line_total"] = existing["qty_total"] * price
    else:
        cart.append({"code": code, "name": p["name"], "color": p.get("color", ""),
                     "sizes": {"": qty}, "unit_price": price, "qty_total": qty,
                     "line_total": qty * price})
    sess["state"] = "CART"
    qr = [("✅ Đặt hàng", "CHECKOUT"), ("➕ Thêm món", "MENU_ORDER"), ("📝 Giỏ hàng", "MENU_CART")]
    return [_msg(f"✔️ Đã thêm *{p['name']}* × {qty} {unit} = *{data.vnd(qty * price)}*.\n"
                 f"Bấm nút bên dưới để tiếp tục nhé.", qr)]


def _cart_summary(sess: dict) -> list[dict]:
    cart = sess["cart"]
    if not cart:
        return [_msg("Dạ giỏ hàng đang trống ạ. Bấm nút bên dưới để chọn nhé!",
                     [("🛒 Xem sản phẩm", "MENU_ORDER")])]
    lines = ["📝 *Giỏ hàng của anh/chị:*", ""]
    subtotal = 0
    # Đánh số từng dòng + nút Sửa/Xoá RIÊNG cho từng dòng (payload neo theo `code` —
    # mỗi code chỉ có TỐI ĐA 1 dòng trong giỏ vì _add_to_cart/_add_food_to_cart luôn
    # gộp vào dòng cũ nếu trùng code, nên không cần lo trùng lặp payload). Trước đây chỉ
    # có "Xoá giỏ" (xoá SẠCH), không có cách sửa/bớt riêng 1 món — khách muốn bớt 1 món
    # phải xoá hết rồi đặt lại từ đầu.
    edit_qr = []
    for i, it in enumerate(cart, start=1):
        lines.append(f"{i}. {_item_label(it)}\n   {_qty_detail(it, sess)} = {data.vnd(it['line_total'])}")
        subtotal += it["line_total"]
        edit_qr.append((f"✏️ Sửa {i}", f"EDITQTY::{it['code']}"))
        edit_qr.append((f"🗑️ Xoá {i}", f"REMOVE::{it['code']}"))
    lines.append(f"\nTạm tính: *{data.vnd(subtotal)}* (chưa gồm phí ship)")
    qr = edit_qr + [("✅ Đặt hàng", "CHECKOUT"), ("➕ Thêm sản phẩm", "MENU_ORDER"),
                     ("🗑️ Xoá giỏ", "CLEAR_CART")]
    return [_msg("\n".join(lines), qr)]


def _edit_qty_prompt(sess: dict, code: str, size_key: str) -> list[dict]:
    """Hỏi số lượng MỚI cho 1 dòng giỏ hàng (hoặc 1 size cụ thể trong dòng đó, ngành
    giày) — `0` là tín hiệu XOÁ hợp lệ ở đây (khác `_show_qty`/thêm mới, nơi 0 luôn là
    chưa hợp lệ)."""
    it = next((x for x in sess["cart"] if x["code"] == code), None)
    if not it:
        sess["state"] = "CART"
        return _cart_summary(sess)
    unit = _unit(sess)
    cur = it["sizes"].get(size_key, it["qty_total"])
    label = f" size {size_key}" if size_key else ""
    return [_msg(f"*{_item_label(it)}*{label} đang có {cur} {unit}. Anh/chị muốn đổi thành mấy {unit} ạ? "
                 f"(nhắn `0` để xoá khỏi giỏ)")]


def _parse_edit_qty(text: str) -> int | None:
    """Số lượng mới khi sửa giỏ hàng — trả None nếu KHÔNG đọc được số nào (để nơi gọi
    hỏi lại thay vì hiểu nhầm gõ lung tung thành xoá). '0'/'không' là tín hiệu XOÁ hợp
    lệ, phải phân biệt rõ với "không đọc được gì" — nếu gộp chung, 1 tin nhắn không rõ
    nghĩa gõ nhầm giữa lúc sửa giỏ sẽ bị hiểu lầm thành xoá mất món của khách."""
    m = re.search(r"\d+", text.replace(".", "").replace(",", ""))
    if m:
        return int(m.group())
    for tok in assistant._strip(text).split():
        if tok in _SO_CHU:
            return _SO_CHU[tok]
    return None


# ---------------- Thu thập thông tin giao hàng ----------------

_INFO_PROMPT = (
    "Tuyệt vời ạ! Để giao hàng, anh/chị cho em xin *thông tin nhận hàng* trong 1 tin nhắn, "
    "mỗi dòng một mục giúp em nhé ạ:\n"
    "• Họ tên người nhận\n"
    "• Số điện thoại\n"
    "• Địa chỉ (số nhà, đường, phường/xã, quận/huyện, tỉnh)\n\n"
    "Ví dụ:\n"
    "Bảo Nguyên\n"
    "0901234567\n"
    "112 Trần Cao Vân, P. Thanh Khê, Đà Nẵng"
)


def _start_checkout(sess: dict) -> list[dict]:
    if not sess["cart"]:
        return [_msg("Dạ giỏ hàng đang trống ạ. Anh/chị chọn trước nhé!", [("🛒 Xem sản phẩm", "MENU_ORDER")])]
    cus = sess.get("customer") or {}
    # Khách đã từng nhập đủ tên/SĐT/địa chỉ (đơn trước đó) → hỏi lại xác nhận thay vì bắt
    # gõ lại từ đầu mỗi lần đặt — trước đây xoá trắng vô điều kiện ở đây dù nơi tạo đơn có
    # ghi chú ý định "giữ tên/địa chỉ cho tiện đặt lần sau" (mâu thuẫn: nói giữ nhưng luôn
    # xoá), khiến khách quen phải nhập lại y hệt mỗi đơn.
    if cus.get("name") and cus.get("phone") and cus.get("address"):
        sess["state"] = "INFO_CONFIRM"
        return [_msg(
            "Dạ giao đến đúng thông tin cũ này giúp em nhé:\n"
            f"👤 {cus['name']}\n📞 {cus['phone']}\n📍 {cus['address']}\n\n"
            "Đúng thì bấm *Đúng, dùng địa chỉ này*, hoặc nhắn thông tin mới nếu muốn đổi.",
            [("✅ Đúng, dùng địa chỉ này", "INFO_KEEP"), ("✏️ Nhập địa chỉ khác", "INFO_NEW")])]
    sess["state"] = "INFO"
    sess["customer"] = {"name": "", "phone": "", "address": ""}
    return [_msg(_INFO_PROMPT)]


def _parse_delivery(text: str) -> dict:
    """Tách họ tên / SĐT / địa chỉ từ 1 tin nhắn. Dựa vào SĐT (9–11 số) làm mốc:
    phần TRƯỚC số là tên, phần SAU là địa chỉ (đúng thứ tự khách thường nhập)."""
    out = {"name": "", "phone": "", "address": ""}
    for m in re.finditer(r"\d[\d .\-]{7,13}\d", text):   # KHÔNG gồm \n để SĐT không dính số dòng khác
        digits = re.sub(r"\D", "", m.group(0))
        if 9 <= len(digits) <= 11:
            out["phone"] = digits
            left = text[:m.start()].strip(" ,;\n\t")
            right = text[m.end():].strip(" ,;\n\t")
            if left:
                out["name"] = re.split(r"[\n]", left)[0].strip(" ,;")
            if right:
                out["address"] = right.replace("\n", ", ").strip(" ,;")
            break
    return out


def _ask_payment(sess: dict) -> list[dict]:
    sess["state"] = "PAYMENT"
    qr = [("💵 COD khi nhận", "PAY::COD khi nhận"), ("🏦 Chuyển khoản", "PAY::Chuyển khoản")]
    return [_msg("Cuối cùng, anh/chị chọn hình thức thanh toán ạ (COD = trả tiền khi nhận hàng):", qr)]


def _review(sess: dict) -> list[dict]:
    cart = sess["cart"]
    cus = sess["customer"]
    subtotal = sum(it["line_total"] for it in cart)
    sess["state"] = "REVIEW"
    lines = ["🧾 *XÁC NHẬN ĐƠN HÀNG*", "Anh/chị kiểm tra giúp em thông tin dưới đây ạ:", ""]
    for it in cart:
        lines.append(f"• {_item_label(it)} — {_qty_detail(it, sess)} = {data.vnd(it['line_total'])}")
    lines += [
        "",
        f"👤 Người nhận: {cus['name']}",
        f"📞 SĐT: {cus['phone']}",
        f"📍 Giao tới: {cus['address']}",
        f"💳 Thanh toán: {sess['payment']}",
        "",
        f"*Tổng cộng: {data.vnd(subtotal)}* (chưa gồm phí ship)",
        "",
        "Bấm nút bên dưới để chốt — shop sẽ gọi xác nhận ngay ạ. 💛",
    ]
    qr = [("✅ Gửi đơn", "SUBMIT"), ("✏️ Sửa giỏ", "MENU_CART"), ("❌ Huỷ", "CANCEL")]
    return [_msg("\n".join(lines), qr)]


# Các state coi là "đang chốt đơn dở dang" — chào hỏi giữa chừng ở các bước này KHÔNG
# được phép reset về menu (mất tiến trình), chỉ nhắc lại đúng bước đang dở (xem
# `_resume_prompt` + nơi gọi trong `handle()`).
_CHECKOUT_STATES = ("INFO", "INFO_CONFIRM", "PAYMENT", "REVIEW", "QTY_INPUT", "SIZE_INPUT",
                     "EDIT_QTY", "EDIT_PICK_SIZE")


def _resume_prompt(sess: dict) -> list[dict]:
    """Nhắc lại ĐÚNG câu hỏi của bước đang dở, không reset — dùng khi khách chào hỏi xã
    giao ('alo', 'chào shop ơi'...) giữa lúc đang chốt đơn (kiểm tra mạng còn thông chẳng
    hạn, rất thường gặp ở khách hàng mạng chập chờn) thay vì bị hiểu nhầm là muốn quay về
    menu và mất hết những gì đã nhập (tên/SĐT/địa chỉ, size đang chọn...)."""
    state = sess.get("state")
    cus = sess.get("customer") or {}
    if state == "INFO":
        return [_msg(_INFO_PROMPT)]
    if state == "INFO_CONFIRM":
        return [_msg(
            f"👤 {cus.get('name','')}\n📞 {cus.get('phone','')}\n📍 {cus.get('address','')}\n"
            "Đúng thì bấm nút giúp em ạ:",
            [("✅ Đúng, dùng địa chỉ này", "INFO_KEEP"), ("✏️ Nhập địa chỉ khác", "INFO_NEW")])]
    if state == "PAYMENT":
        return [_msg("Anh/chị chọn giúp em hình thức thanh toán ạ:",
                     [("💵 COD khi nhận", "PAY::COD khi nhận"), ("🏦 Chuyển khoản", "PAY::Chuyển khoản")])]
    if state == "REVIEW":
        return _review(sess)
    code = sess.get("pending_product")
    if state == "QTY_INPUT" and code in _prods(sess):
        return _show_qty(sess, code)
    if state == "SIZE_INPUT" and code in _prods(sess):
        return _show_size_grid(sess, code)
    if state == "EDIT_QTY" and any(it["code"] == code for it in sess["cart"]):
        return _edit_qty_prompt(sess, code, sess.get("pending_edit_size", ""))
    if state == "EDIT_PICK_SIZE":
        it = next((x for x in sess["cart"] if x["code"] == code), None)
        if it:
            qr = [(f"Size {s} ({q})", f"EDITSIZE::{code}::{s}") for s, q in it["sizes"].items()]
            return [_msg(f"*{_item_label(it)}* đang có nhiều size, anh/chị muốn sửa size nào ạ?", qr)]
    return _main_menu()


def _submit(sess: dict) -> list[dict]:
    """Cổng vào công khai — khoá theo phiên để 2 lượt xử lý CÙNG 1 phiên chồng nhau thật
    sự đồng thời (vd webhook gửi lại đúng sự kiện 'Gửi đơn' trước khi lượt đầu kịp xoá
    giỏ) không thể cùng lọt qua kiểm tra 'giỏ hàng còn gì' và tạo 2 đơn trùng cho 1 lần
    khách bấm. Không ảnh hưởng khách khác (khoá theo từng phiên riêng)."""
    key = sess.get("_key")
    if not key:
        return _do_submit(sess)
    lock = _submit_lock(key)
    if not lock.acquire(blocking=False):
        return [_msg("Dạ đơn đang được xử lý, anh/chị đợi em một chút ạ 🙏")]
    try:
        return _do_submit(sess)
    finally:
        lock.release()


def _handle_stock_shortage(sess: dict, shortages: list[dict]) -> list[dict]:
    """Có khách khác vừa lấy hết đúng lúc mình chốt đơn (2 người cùng nhắm 1 size cuối
    cùng) — KHÔNG tạo đơn, tự cắt giỏ hàng về đúng số còn thật rồi mời khách xem lại
    trước khi gửi lại, thay vì âm thầm tạo đơn cho cả hai người và phải huỷ 1 bên sau."""
    cart = sess["cart"]
    lines = ["😥 Dạ rất tiếc, đúng lúc anh/chị chốt đơn thì có khách khác vừa đặt trước:"]
    for s in shortages:
        lines.append(f"• {s['name']} size {s['size']}: chỉ còn {s['available']} "
                     f"(anh/chị đang đặt {s['requested']}).")
        for it in cart:
            if it["code"] == s["code"] and s["size"] in it.get("sizes", {}):
                if s["available"] <= 0:
                    it["sizes"].pop(s["size"], None)
                else:
                    it["sizes"][s["size"]] = s["available"]
    sess["cart"] = [it for it in cart if it.get("sizes")]
    for it in sess["cart"]:
        it["qty_total"] = sum(it["sizes"].values())
        it["line_total"] = it["qty_total"] * it["unit_price"]
    sess["state"] = "CART"
    lines.append("\nEm đã cập nhật lại giỏ hàng theo đúng số còn hàng, anh/chị xem lại giúp em nhé 🙏")
    return [_msg("\n".join(lines))] + _cart_summary(sess)


def _do_submit(sess: dict) -> list[dict]:
    if not sess["cart"]:
        return _cart_summary(sess)
    cart = sess["cart"]
    cus = sess["customer"]
    subtotal = sum(it["line_total"] for it in cart)

    order, shortages = store.create_retail_order_checked(
        items=cart, subtotal=subtotal,
        customer={"name": cus["name"], "phone": cus["phone"], "address": cus["address"],
                  "fb_psid": sess.get("psid")},
        # Ghi ĐÚNG kênh khách đặt qua (câu 9 — dùng bộ giá trị CHANNEL_TYPES của
        # stores.py: "facebook"/"zalo_oa"/"zalo_personal"), không hardcode "facebook"
        # nữa (trước đây MỌI đơn — kể cả qua kênh khác — đều bị ghi nhầm "facebook").
        payment=sess["payment"], channel=sess.get("channel", "facebook"),
        created_at=data.now_vn().strftime("%d/%m/%Y %H:%M"),
        store_id=sess.get("store_id", "default"), has_size=_has_size(sess),
    )
    if shortages:
        return _handle_stock_shortage(sess, shortages)
    oid = order["id"]
    pay = sess["payment"]
    sess["my_orders"].append(oid)
    # reset để có thể đặt tiếp (giữ tên/địa chỉ cho tiện đặt lần sau — thật sự giữ được từ
    # giờ vì `_start_checkout` không còn xoá trắng vô điều kiện, xem hàm đó)
    sess["cart"], sess["state"], sess["payment"] = [], "MENU", None

    body = (f"🎉 *Đặt hàng thành công!*  Mã đơn: *{oid}*\n"
            f"💰 Tổng: {data.vnd(subtotal)} · {pay or ''}\n"
            f"📍 Giao tới: {cus['address']}\n\n"
            f"Shop sẽ gọi *xác nhận trong ít phút* rồi giao hàng tận nơi cho anh/chị ạ.\n"
            f"Cảm ơn *{cus['name']}* đã tin tưởng *{_store(sess).get('shop_label','shop')}*! 💛")
    qr = [("🔎 Tra đơn " + oid, f"TRACK::{oid}"), ("🛒 Mua tiếp", "MENU_ORDER"),
          ("📋 Menu", "MENU")]
    return [_msg(body, qr)]


def _track(sess: dict, oid: str | None) -> list[dict]:
    sid = sess.get("store_id", "default")
    o = store.get_order(oid, sid) if oid else None
    if o:
        detail = "\n".join(
            f"  • {_item_label(it)} — {_qty_detail(it, sess)} = {data.vnd(it['line_total'])}"
            for it in o["items"])
        return [_msg(
            f"🔎 *Đơn {o['id']}*\nNgày: {o['created_at']}\n{detail}\n"
            f"Tổng: *{data.vnd(o['subtotal'])}* · {o['payment']}\n"
            f"Giao tới: {o.get('customer_address', '')}\n"
            f"Trạng thái: *{o['status']}*", [("📋 Menu", "MENU")])]
    mine = [store.get_order(i, sid) for i in sess.get("my_orders", [])]
    mine = [m for m in mine if m]
    if not mine:
        # Phiên RAM có thể vừa bị mất (restart/deploy) trong khi đơn thật vẫn còn trong
        # DB — tra lại theo chính khách (PSID) thay vì chỉ tin danh sách của phiên hiện
        # tại, để không báo nhầm "chưa có đơn nào" cho khách thực ra đã từng đặt.
        mine = store.list_orders_by_psid(sess.get("psid"), sid)
    if not mine:
        return [_msg("Dạ em chưa thấy đơn nào của anh/chị ạ. Anh/chị đặt thử một đơn nhé!",
                     [("🛒 Xem sản phẩm", "MENU_ORDER")])]
    qr = [(o["id"], f"TRACK::{o['id']}") for o in mine[-9:]]
    lines = ["📦 Các đơn của anh/chị:"] + [
        f"• {o['id']} — {data.vnd(o['subtotal'])} — {o['status']}" for o in mine[-9:]]
    return [_msg("\n".join(lines), qr)]


def _extract_size_qty(text: str, store_id: str = "default") -> dict:
    """Quét MỌI cặp size:sốlượng trong câu tự do: 'mua Flame 40:2, 41:1' -> {40:2,41:1}.
    Theo ĐÚNG kiểu biến thể của store (số trong dải tự đặt, hay nhãn tự đặt như S/M/L) —
    không hardcode dải giày 24-46 nữa."""
    st = stores.get(store_id)
    out: dict = {}
    if st.get("variant_mode") == "nhan":
        labels = st.get("variant_labels") or []
        up = text.upper()
        for lb in labels:
            for m in re.finditer(rf"{re.escape(lb.upper())}\s*[:xX=]\s*(\d+)", up):
                out[lb] = out.get(lb, 0) + int(m.group(1))
        return out
    lo, hi = st.get("variant_min", 24), st.get("variant_max", 46)
    for sz, q in re.findall(r"(\d{2,3})\s*[:xX=]\s*(\d+)", text):
        if lo <= int(sz) <= hi:
            out[sz] = out.get(sz, 0) + int(q)
    return out


def _try_direct_add(sess: dict, code: str, text: str) -> list[dict] | None:
    """Khách gõ mã sản phẩm KÈM LUÔN size/số lượng trong cùng 1 câu (vd 'lấy mã
    GMI0008-DEN size 39 cho em 1 đôi') — thêm giỏ NGAY, không hỏi lại. Trước đây nhánh
    gõ-mã-tay (dò qua _find_code_candidates) luôn nhảy thẳng vào _show_size_grid/
    _show_qty bất kể câu có kèm đủ size/số lượng hay chưa, bỏ qua hoàn toàn logic trích
    size+SL tự nhiên mà _try_nl_order đã có sẵn — bug tìm thấy khi quay demo: khách nói
    đủ mã+size+số lượng trong 1 câu vẫn bị hỏi lại size. Trả None nếu câu không kèm đủ
    thông tin, để nơi gọi rơi về hỏi lại như cũ."""
    store_id = sess.get("store_id", "default")
    s = assistant._strip(text)
    if not _has_size(sess):
        qty = assistant._parse_qty(s, store_id)
        return _add_food_to_cart(sess, code, qty) if qty else None
    rest = re.sub(re.escape(code.lower()), " ", s)
    qtys = _extract_size_qty(re.sub(re.escape(code), " ", text, flags=re.I), store_id)
    if not qtys:
        sizes = assistant._parse_sizes(rest, store_id)
        if not sizes:
            return None
        qty = assistant._parse_qty(s) or 1
        qtys = {sz: qty for sz in sizes}
    return _add_to_cart(sess, code, qtys)


def _try_nl_order(sess: dict, text: str) -> list[dict] | None:
    """Chat tự nhiên RA ĐƠN: '2 đôi sandal size 40', 'mua Flame 40:2, 41:1'.
    Khớp mẫu + size + số lượng → thêm vào giỏ (tái dùng _add_to_cart). Trả None nếu
    không phải ý đặt hàng (để rơi xuống trợ lý tư vấn)."""
    s = assistant._strip(text)
    prod = assistant._match_product({"products": list(_prods(sess).values())}, s)
    if not prod:
        return None
    code = prod["code"]
    store_id = sess.get("store_id", "default")
    if not _has_size(sess):
        # Ngành KHÔNG có size (quán ăn...) — chỉ cần khớp món + số lượng, không có khái
        # niệm size nên không dùng nhánh _extract_size_qty/_parse_sizes bên dưới (dành
        # riêng cho ngành có size như giày). Trước đây thiếu hẳn nhánh này khiến câu "cho
        # em 2 phần cháo thập cẩm" luôn rơi xuống AI tư vấn (không món nào thật sự vào
        # giỏ), và AI lại tự bịa "đã thêm..." dù chưa hề đụng giỏ hàng — bug tìm thấy khi
        # quay demo Cháo (khách tưởng đã đặt xong nhưng giỏ hàng vẫn trống).
        if not assistant._is_create_intent(s, store_id):
            return None
        qty = assistant._parse_qty(s, store_id) or 1
        return _add_food_to_cart(sess, code, qty)
    # Bỏ chính mã sản phẩm khỏi chuỗi để chữ số trong mã (vd 'SDG0141') KHÔNG bị đọc thành size.
    s_size = s.replace(code.lower(), " ")
    qtys = _extract_size_qty(re.sub(re.escape(code), " ", text, flags=re.I), store_id)  # size:sốlượng (40:2, 41:1)
    if qtys:
        return _add_to_cart(sess, code, qtys)
    sizes = assistant._parse_sizes(s_size, store_id)
    # Coi là ĐẶT khi có động từ (đặt/mua/lấy…) HOẶC nêu rõ số lượng 'N đôi'.
    has_qty = re.search(r"\d+\s*doi", s)
    is_order = bool(assistant._is_create_intent(s, store_id) or has_qty)
    if not sizes:
        # Có ý đặt nhưng CHƯA nói size → mở luôn bảng chọn size của mẫu để hỏi tiếp.
        return _show_size_grid(sess, code) if is_order else None
    if not is_order:
        return None                                   # chỉ nêu tên+size, chưa rõ ý → để AI tư vấn
    qty = assistant._parse_qty(s) or 1                # khách lẻ mặc định 1 đôi/size
    return _add_to_cart(sess, code, {sz: qty for sz in sizes})


def _flag_recent_order(sess: dict, complaint_text: str) -> str | None:
    """Khách đang than phiền. Nếu khách NÊU RÕ mã đơn trong câu (vd 'đơn DH1042 giao
    thiếu') thì gắn đúng đơn đó — ưu tiên trước, vì đoán bừa 'đơn gần nhất' có thể sai
    khi khách đang phàn nàn về 1 đơn CŨ trong lúc vừa đặt thêm 1 đơn MỚI khác (đơn gần
    nhất lúc đó không phải đơn khách đang nói tới). Không nêu mã đơn → mới suy đoán đơn
    gần nhất của khách qua PSID như trước (chấp nhận có thể sai với ca trên, chưa có
    cách hỏi lại khách trong luồng này). Trả mã đơn nếu gắn được, None nếu không có gì
    để gắn cờ."""
    sid = sess.get("store_id")
    mo = re.search(r"\bDH\s*\d{3,}\b", complaint_text, re.I)
    if mo:
        oid = re.sub(r"\s+", "", mo.group(0)).upper()
        if store.get_order(oid, sid):
            store.flag_order(oid, complaint_text)
            return oid
    orders = store.list_orders_by_psid(sess.get("psid"), sid)
    if not orders:
        return None
    store.flag_order(orders[0]["id"], complaint_text)
    return orders[0]["id"]


def _ai_reply(sess: dict, text: str) -> list[dict]:
    """Route câu hỏi tự do sang trợ lý bán lẻ. Nếu khớp sản phẩm → hiện CAROUSEL có ẢNH."""
    res = assistant.answer_retail(text, sess.get("store_id"))
    prods = _prods(sess)
    codes = [c for c in (res.get("product_codes") or []) if c in prods]

    answer = res["answer"]
    if res.get("is_complaint"):
        flagged_id = _flag_recent_order(sess, text)
        if flagged_id:
            answer += f"\n\n📌 Em đã ghi nhận vào đơn {flagged_id}, shop sẽ kiểm tra và liên hệ lại sớm ạ."

    if codes:
        sess["last_shown"] = codes[:10]
        elements = [_product_card(prods[c], _unit(sess)) for c in codes[:10]]
        # Câu `answer` là AI đã đọc đúng câu hỏi của khách (ngân sách, màu sắc, chính sách
        # ship...) rồi mới chọn ra `codes` — trước đây bị vứt bỏ, thay bằng 1 dòng mẫu
        # cứng, khiến khách không bao giờ thấy phần AI đã trả lời đúng ý mình (khách thấy
        # bot như rule-based dù AI đã suy luận đúng phía sau). Chỉ fallback về dòng mẫu
        # khi AI trả answer rỗng (không nên xảy ra, nhưng đừng hiện tin nhắn trống).
        intro = _msg(answer.strip() if answer and answer.strip() else
                     "Dạ đây là các lựa chọn phù hợp ạ 👇 Bấm *🛒 Chọn* trên mục anh/chị thích để đặt nhé.")
        return [intro, _product_carousel(elements, [("📝 Giỏ hàng", "MENU_CART"),
                                                    ("🔎 Tra đơn", "MENU_TRACK")])]
    chips = res.get("chips") or ["🛒 Xem sản phẩm"]
    qr = [(c, "MENU_ORDER" if "Xem sản phẩm" in c else c) for c in chips[:4]]
    return [_msg(answer, qr)]


def _find_code_candidates(sess: dict, text: str) -> list[str]:
    """Tìm mã sản phẩm khách GÕ TAY, kể cả gõ TẮT (thiếu phần -MÀU, vd 'SD3638' thay vì
    'SD3638-49-HONG') hay có chữ dẫn bất kỳ ('chọn SD3638', 'đặt hàng SD3638'...). KHÔNG
    dò theo 1 danh sách chữ dẫn cố định (dễ thiếu — từng bỏ sót 'đặt hàng') mà lấy TOKEN
    giống mã sản phẩm nhất (có chữ+số) ở bất kỳ đâu trong câu. Ưu tiên tìm trong các mã
    VỪA hiện cho khách (last_shown). Trả rỗng nếu không có token giống mã; trả NHIỀU mã
    nếu mập mờ (nhiều màu cùng mã gốc) — để nơi gọi tự quyết hỏi lại hay chọn bừa."""
    s = assistant._strip(text)
    candidates = [t.upper() for t in re.findall(r"[a-z0-9]+(?:-[a-z0-9]+)*", s)
                  if len(t) >= 3 and any(ch.isdigit() for ch in t)]
    if not candidates:
        return []
    prods = _prods(sess)
    for c in candidates:
        if c in prods:
            return [c]
    for pool in (sess.get("last_shown") or [], list(prods.keys())):
        for c in candidates:
            hits = [code for code in pool if code.upper().startswith(c)]
            if hits:
                return hits
    return []


def _resolve_typed_code(sess: dict, text: str) -> str | None:
    """Như _find_code_candidates nhưng chỉ nhận khi khớp mã DUY NHẤT, tránh chọn bừa
    lúc mập mờ (nhiều màu cùng mã gốc)."""
    hits = _find_code_candidates(sess, text)
    return hits[0] if len(hits) == 1 else None


def _ambiguous_code_prompt(sess: dict, hits: list[str]) -> list[dict]:
    """Mã khách gõ khớp NHIỀU màu cùng mã gốc — hỏi lại rõ đúng vấn đề (chọn màu nào),
    không để rơi xuống hỏi size (dễ hiểu lầm là bot không hiểu, như đã gặp)."""
    prods = _prods(sess)
    lines = [f"Dạ mã đó có {len(hits)} màu, anh/chị chọn giúp em:"]
    for code in hits[:10]:
        p = prods.get(code)
        if p:
            lines.append(f"• {code} — màu {p.get('color', '')}")
    lines.append("\nAnh/chị gõ đúng mã màu muốn chọn giúp em nhé.")
    return [_msg("\n".join(lines))]


# ---------------- Bộ điều phối chính ----------------

def handle_or_paused(sender_id: str, text: str, store_id: str = "default",
                      channel: str = "facebook") -> list[dict]:
    """Cổng vào DUY NHẤT dùng cho webhook Facebook thật + trình giả lập + kênh Zalo — chặn
    TRƯỚC khi vào handle() nếu store đang 'paused' (trước đây field này chỉ ghi nhận trên
    admin, không có tác dụng thật, khách vẫn nhận được trả lời bình thường).
    `channel` mặc định "facebook" để KHÔNG hồi quy webhook FB/simulator hiện có; kênh
    khác (Zalo OA/Zalo cá nhân) truyền tường minh (xem main.py)."""
    if stores.get(store_id).get("status") == "paused":
        return [_msg("Dạ hiện shop tạm ngừng nhận tin nhắn/đặt hàng, mong anh/chị thông "
                      "cảm 🙏 Có gì cần gấp anh/chị liên hệ trực tiếp giúp em nhé.")]
    return handle(sender_id, text, store_id, channel)


def handle(sender_id: str, text: str, store_id: str = "default", channel: str = "facebook") -> list[dict]:
    # Chuẩn hoá NFC ngay từ đầu — 1 số thiết bị/bàn phím gửi tiếng Việt ở dạng NFD (tổ
    # hợp dấu riêng, byte khác NFC dù hiển thị giống hệt), khiến MỌI so khớp chữ có dấu
    # chính xác (low in (...)) phía dưới lặng lẽ thất bại. Đã gặp thật: gõ 'đặt hàng' từ
    # Messenger thật không khớp dù test tay (NFC) thì khớp.
    text = unicodedata.normalize("NFC", (text or "").strip())
    sess = _session(sender_id, store_id, channel)
    sess["psid"] = sender_id
    sess["store_id"] = store_id
    sess["channel"] = channel
    sid = store_id
    low = text.lower()

    # Lệnh chung ở mọi trạng thái
    if low in ("menu", "/menu", "bắt đầu", "bat dau", "start"):
        sess["state"] = "MENU"
        return _main_menu()
    # Khách gõ TAY đúng chữ hiển thị trên nút ("✅ Đặt hàng") thay vì bấm nút — payload
    # thật của nút là 'CHECKOUT' (mã nội bộ), không phải chữ hiển thị, nên phải nhận
    # diện thêm câu tự nhiên tương đương để không rơi qua AI xử lý sai (đã gặp thật).
    # LƯU Ý: "chốt đơn"/"xác nhận đơn" KHÔNG được liệt ở đây dù nghe cũng hợp — 2 cụm đó
    # đã có nghĩa khác (gửi đơn luôn) trong danh sách state==REVIEW bên dưới; để cả ở đây
    # thì check này (không xét state, chạy trước) luôn thắng, khiến khách gõ "chốt đơn"
    # lúc đang ở màn xác nhận cuối bị đẩy ngược về bước nhập lại thông tin thay vì gửi
    # đơn — bug tìm thấy khi test thật.
    if low in ("dat hang", "đặt hàng", "checkout", "thanh toan", "thanh toán"):
        return _start_checkout(sess)
    # Lời chào ('alo', 'chào shop ơi'...) — khách hàng mạng chập chờn rất hay gõ câu này
    # giữa chừng chỉ để kiểm tra bot còn phản hồi không, KỂ CẢ khi đang chốt đơn dở dang.
    # Nếu đang ở 1 bước đang dở (đã nhập size/đang điền thông tin/đang chọn thanh
    # toán/đang xem lại đơn), KHÔNG được reset về menu (mất tiến trình, khách phải làm
    # lại từ đầu) — chỉ nhắc lại đúng bước đang dở. Chỉ reset về menu khi đang ở các bước
    # "chưa có gì để mất" (MENU/CATEGORY/CART...), giữ đúng ý ban đầu là tránh hiểu nhầm
    # lời chào thành đang nhập size.
    if _is_greeting(low):
        if sess.get("state") in _CHECKOUT_STATES:
            return [_msg("Dạ shop nghe đây ạ 👋")] + _resume_prompt(sess)
        sess["state"] = "MENU"
        sess["pending_product"] = None
        return _welcome(sid)
    if low in ("huỷ", "hủy", "cancel", "/cancel"):
        sess["cart"], sess["payment"] = [], None
        sess["customer"] = {"name": "", "phone": "", "address": ""}
        sess["state"] = "MENU"
        return [_msg("Dạ đã huỷ ạ. Anh/chị cần gì thêm cứ nhắn em nhé 👇")] + _main_menu()
    # Gõ TAY tương đương các nút khác — không chặn ở đây thì rơi qua AI, có nguy cơ AI
    # BỊA câu trả lời nghe hợp lý ("đã xoá giỏ") mà KHÔNG có hành động thật đằng sau
    # (đã gặp thật: giỏ hàng không hề được xoá dù AI nói đã xoá).
    if low in ("gio hang", "giỏ hàng", "xem gio hang", "xem giỏ hàng"):
        return _cart_summary(sess)
    if low in ("tra don", "tra đơn", "kiem tra don", "kiểm tra đơn", "check don",
               "tra don hang", "tra đơn hàng"):
        return _track(sess, None)
    if low in ("xoa gio", "xóa giỏ", "xoá giỏ", "xoa gio hang", "xóa giỏ hàng",
               "xoá giỏ hàng", "clear cart"):
        sess["cart"] = []
        return [_msg("Đã xoá giỏ hàng.")] + _main_menu()
    # Gõ TAY tương đương nút "MENU_ORDER" (payload nội bộ, không phải chữ hiển thị) —
    # nút DUY NHẤT không có alias text từ trước (B1, kế hoạch multi-tenant): Zalo cá
    # nhân không có nút bấm nên khách phải gõ được các câu này mới xem lại được danh mục.
    if low in ("xem san pham", "xem sản phẩm", "san pham", "sản phẩm", "xem menu",
               "xem hang", "xem hàng", "nhom khac", "nhóm khác",
               "doi san pham", "đổi sản phẩm", "doi mon", "đổi món",
               "them san pham", "thêm sản phẩm", "them mon", "thêm món",
               "mua tiep", "mua tiếp"):
        sess["state"] = "CATEGORY"
        return _show_categories(sid)

    # Payload từ quick reply / nút bấm
    if text.startswith("CAT::"):
        return _show_products(text[5:], sid, sess)
    if text.startswith("PROD::"):
        return _show_size_grid(sess, text[6:]) if _has_size(sess) else _show_qty(sess, text[6:])
    if text.startswith("IMG::"):
        return _show_product_images(text[5:], sid)
    if text.startswith("PAY::"):
        if not sess["cart"]:
            return _cart_summary(sess)
        sess["payment"] = text[5:]
        return _review(sess)
    if text.startswith("TRACK::"):
        return _track(sess, text[7:])
    if text in ("MENU_ORDER", "CHECKOUT_BACK"):
        sess["state"] = "CATEGORY"
        return _show_categories(sid)
    if text == "MENU_CART":
        return _cart_summary(sess)
    if text == "MENU_TRACK":
        return _track(sess, None)
    if text == "CHECKOUT":
        return _start_checkout(sess)
    if text == "INFO_KEEP":
        if sess.get("state") != "INFO_CONFIRM":
            return _start_checkout(sess)
        return _ask_payment(sess)
    if text == "INFO_NEW":
        sess["state"] = "INFO"
        sess["customer"] = {"name": "", "phone": "", "address": ""}
        return [_msg(_INFO_PROMPT)]
    if text == "CLEAR_CART":
        sess["cart"] = []
        return [_msg("Đã xoá giỏ hàng.")] + _main_menu()
    # Sửa/xoá TỪNG dòng trong giỏ (nút "✏️ Sửa"/"🗑️ Xoá" ở _cart_summary) — payload neo
    # theo product code, không theo vị trí, nên xoá/sửa xong thứ tự đổi cũng không sai.
    if text.startswith("REMOVE::"):
        code = text[len("REMOVE::"):]
        sess["cart"] = [it for it in sess["cart"] if it["code"] != code]
        sess["state"] = "CART"
        return [_msg("Đã xoá món khỏi giỏ ạ.")] + _cart_summary(sess)
    if text.startswith("EDITQTY::"):
        code = text[len("EDITQTY::"):]
        it = next((x for x in sess["cart"] if x["code"] == code), None)
        if not it:
            return _cart_summary(sess)
        sess["pending_product"] = code
        # Ngành giày, 1 dòng có nhiều size cùng lúc -> phải hỏi rõ sửa size nào trước,
        # không thì không biết khách muốn đổi số lượng của size nào trong dòng đó.
        if _has_size(sess) and len(it["sizes"]) > 1:
            sess["state"] = "EDIT_PICK_SIZE"
            qr = [(f"Size {s} ({q})", f"EDITSIZE::{code}::{s}") for s, q in it["sizes"].items()]
            return [_msg(f"*{_item_label(it)}* đang có nhiều size, anh/chị muốn sửa size nào ạ?", qr)]
        size_key = next(iter(it["sizes"]), "")
        sess["pending_edit_size"] = size_key
        sess["state"] = "EDIT_QTY"
        return _edit_qty_prompt(sess, code, size_key)
    if text.startswith("EDITSIZE::"):
        _, code, size_key = text.split("::", 2)
        sess["pending_product"] = code
        sess["pending_edit_size"] = size_key
        sess["state"] = "EDIT_QTY"
        return _edit_qty_prompt(sess, code, size_key)
    if text == "SUBMIT":
        return _submit(sess)
    if text == "MENU":
        sess["state"] = "MENU"
        return _main_menu()

    state = sess["state"]

    # Đang hỏi số lượng MỚI để sửa 1 dòng giỏ hàng (nút "✏️ Sửa" ở _cart_summary).
    if state == "EDIT_QTY":
        code = sess.get("pending_product")
        size_key = sess.get("pending_edit_size", "")
        it = next((x for x in sess["cart"] if x["code"] == code), None)
        if not it:
            sess["state"] = "CART"
            return _cart_summary(sess)
        qty = _parse_edit_qty(text)
        if qty is None:
            unit = _unit(sess)
            return [_msg(f"Dạ anh/chị nhắn số {unit} muốn đổi thành giúp em nhé (vd `2`, hoặc `0` để xoá).")]
        sess["state"] = "CART"
        if qty <= 0:
            if size_key and len(it["sizes"]) > 1:
                it["sizes"].pop(size_key, None)
                it["qty_total"] = sum(it["sizes"].values())
                it["line_total"] = it["qty_total"] * it["unit_price"]
            else:
                sess["cart"] = [x for x in sess["cart"] if x["code"] != code]
            return [_msg("Đã xoá khỏi giỏ ạ.")] + _cart_summary(sess)
        it["sizes"][size_key] = qty
        it["qty_total"] = sum(it["sizes"].values())
        it["line_total"] = it["qty_total"] * it["unit_price"]
        return [_msg(f"Đã cập nhật *{_item_label(it)}* thành {it['qty_total']} {_unit(sess)} ạ.")] + _cart_summary(sess)

    # Quán ăn: đang hỏi SỐ PHẦN của 1 món
    if state == "QTY_INPUT":
        code = sess["pending_product"]
        if text.upper() not in _prods(sess):
            hits = _find_code_candidates(sess, text)
            if len(hits) > 1:                      # gõ mã mập mờ (nhiều màu) -> hỏi lại rõ
                return _ambiguous_code_prompt(sess, hits)
            if len(hits) == 1:                     # gõ mã món khác để đổi (chấp nhận gõ tắt)
                return _show_qty(sess, hits[0])
        else:
            return _show_qty(sess, text.upper())
        confirm_m = re.match(r"xac nhan\s+(\d+)", assistant._strip(text))
        if confirm_m:
            return _add_food_to_cart(sess, code, int(confirm_m.group(1)), confirmed=True)
        m = re.search(r"\d+", text.replace(".", "").replace(",", ""))
        qty = int(m.group()) if m else _word_to_qty(text)
        if qty <= 0:
            return [_msg(f"Dạ anh/chị nhắn *số {_unit(sess)}* muốn đặt giúp em nhé (ví dụ: `2`).")]
        return _add_food_to_cart(sess, code, qty)

    # Đang nhập số lượng theo size (ngành giày)
    if state == "SIZE_INPUT":
        code = sess["pending_product"]
        if text.upper() not in _prods(sess):
            hits = _find_code_candidates(sess, text)
            if len(hits) > 1:                      # gõ mã mập mờ (nhiều màu) -> hỏi lại rõ
                return _ambiguous_code_prompt(sess, hits)
            if len(hits) == 1:                     # gõ mã khác để đổi sản phẩm (chấp nhận gõ tắt)
                return _show_size_grid(sess, hits[0])
        else:
            return _show_size_grid(sess, text.upper())
        # Nhận cả 'size:sốlượng' (40:2, 41:1) LẪN câu tự nhiên ('40', '40 lấy 2 đôi').
        qtys = _extract_size_qty(text, sid)
        if not qtys:
            ss = assistant._strip(text)
            sizes = assistant._parse_sizes(ss, sid)
            if sizes:
                qty = assistant._parse_qty(ss) or 1
                qtys = {sz: qty for sz in sizes}
        if not qtys:
            # Câu HỎI về size ('còn size khác không', 'size nào') → show lại bảng size đầy đủ.
            if "size" in assistant._strip(text):
                return _show_size_grid(sess, code)
            av = [s for s, st in _prods(sess)[code]["sizes"].items() if st > 0]
            a1 = av[0] if av else "39"
            a2 = av[1] if len(av) >= 2 else a1
            follow = _msg(f"Dạ em chưa rõ size ạ 😅 Anh/chị nhắn giúp em, ví dụ `{a1}` (1 {_unit(sess)} size {a1}), "
                          f"`{a1} lấy 2 {_unit(sess)}`, hoặc nhiều size `{a1}:1, {a2}:2` nhé.")
            # Câu hỏi/lan man chen ngang lúc đang chọn size ('ship mấy ngày', 'đổi trả
            # được không') — trả lời qua AI trước rồi mới hỏi lại size, KHÔNG lặng lẽ nuốt
            # câu hỏi bằng đúng câu "chưa rõ size" như trước (bug tìm thấy khi quay demo:
            # khách hỏi ship giữa lúc chọn size, bot phớt lờ câu hỏi).
            if _looks_like_offtopic(text):
                return _ai_reply(sess, text) + [follow]
            return [follow]
        return _add_to_cart(sess, code, qtys)

    # Đang hỏi "giao đến địa chỉ cũ có đúng không" — khách gõ tự do thay vì bấm nút.
    if state == "INFO_CONFIRM":
        got = _parse_delivery(text)
        if got["phone"]:
            # Khách gõ hẳn thông tin mới thay vì bấm nút -> hiểu là muốn đổi, nhận luôn.
            sess["customer"] = {"name": got["name"] or sess["customer"].get("name", ""),
                                 "phone": got["phone"],
                                 "address": got["address"] or sess["customer"].get("address", "")}
            sess["state"] = "INFO"
            missing = [k for k in ("name", "phone", "address") if not sess["customer"].get(k)]
            if missing:
                lbl = {"name": "*họ tên người nhận*", "phone": "*số điện thoại*",
                       "address": "*địa chỉ nhận hàng*"}
                return [_msg("Dạ em xin thêm " + ", ".join(lbl[m] for m in missing)
                             + " giúp em nữa nhé ạ (mỗi mục một dòng):")]
            return _ask_payment(sess)
        return [_msg("Dạ anh/chị bấm giúp em 1 trong 2 nút bên dưới nhé ạ 👇",
                     [("✅ Đúng, dùng địa chỉ này", "INFO_KEEP"), ("✏️ Nhập địa chỉ khác", "INFO_NEW")])]

    # Thu thập thông tin giao hàng trong 1 tin (text là DỮ LIỆU, không route AI).
    if state == "INFO":
        cus = sess["customer"]
        got = _parse_delivery(text)
        # Khách hỏi lan man/lạc đề chen ngang (không có SĐT neo) — trả lời qua AI rồi
        # hỏi lại đúng các mục còn thiếu, KHÔNG được nuốt câu hỏi làm tên/địa chỉ.
        if not got["phone"] and _looks_like_offtopic(text):
            missing = [k for k in ("name", "phone", "address") if not cus.get(k)]
            lbl = {"name": "*họ tên người nhận*", "phone": "*số điện thoại*",
                   "address": "*địa chỉ nhận hàng*"}
            follow = _msg("Dạ để tiếp tục đặt hàng, anh/chị cho em xin " + ", ".join(lbl[m] for m in missing)
                          + " giúp em nhé ạ:")
            return _ai_reply(sess, text) + [follow]
        if got["phone"]:
            # Tin có SĐT -> khách đang gửi lại (hoặc gửi lần đầu) CẢ KHỐI thông tin trong 1
            # tin nhắn -> field nào tin mới CÓ thì ghi đè field cũ, không chỉ điền chỗ
            # trống. Trước đây dùng `not cus.get(...)` nên nếu tin đầu tiên bị hiểu sai
            # (vd dính rác vào "tên" vì chưa có SĐT), tin sau gửi lại đúng vẫn giữ tên rác
            # cũ — bug tìm thấy khi test thật. Khớp đúng cách INFO_CONFIRM đã làm ở trên.
            cus["phone"] = got["phone"]
            if got["name"]:
                cus["name"] = got["name"]
            if got["address"]:
                cus["address"] = got["address"]
        else:
            # Tin không có SĐT → coi là bổ sung đúng ô còn thiếu (địa chỉ trước, rồi tên).
            t = text.strip(" ,;\n\t")
            if cus.get("name") and cus.get("phone") and not cus.get("address"):
                cus["address"] = t
            elif not cus.get("name"):
                cus["name"] = t
        missing = [k for k in ("name", "phone", "address") if not cus.get(k)]
        if missing:
            lbl = {"name": "*họ tên người nhận*", "phone": "*số điện thoại*",
                   "address": "*địa chỉ nhận hàng*"}
            return [_msg("Dạ em xin thêm " + ", ".join(lbl[m] for m in missing)
                         + " giúp em nữa nhé ạ (mỗi mục một dòng):")]
        return _ask_payment(sess)

    # Đang hỏi PHƯƠNG THỨC thanh toán — khách gõ TAY đúng/gần chữ trên nút thay vì bấm
    # (payload nút là 'PAY::...', không phải chữ hiển thị) → nhận diện thêm câu tự nhiên.
    # Dùng so khớp CHỨA (không phải khớp CẢ CÂU chính xác) + bản đã bỏ dấu, để chịu được
    # sai chính tả/thiếu-thừa 1 chữ (vd 'chuyen khoang', 'ck nha', 'cod nhe ạ') — trước
    # đây khớp chính xác tuyệt đối khiến các câu này rơi tuột xuống AI tư vấn, khách mất
    # dấu vết đang cần chọn thanh toán.
    if state == "PAYMENT":
        s = assistant._strip(text)
        if any(k in s for k in ("chuyen khoan", "chuyen khoang")) or s.strip() in ("ck", "banking"):
            if not sess["cart"]:
                return _cart_summary(sess)
            sess["payment"] = "Chuyển khoản"
            return _review(sess)
        if (any(k in s for k in ("tien mat", "khi nhan")) or s.strip() == "cod"
                or re.search(r"\bcod\b", s)):
            if not sess["cart"]:
                return _cart_summary(sess)
            sess["payment"] = "COD khi nhận"
            return _review(sess)
        # Khách hỏi lại tổng tiền giữa lúc đang chọn thanh toán — trả lời TRỰC TIẾP từ
        # giỏ hàng thật, KHÔNG rơi qua AI chung ở dưới: AI đó không có ngữ cảnh phiên/giỏ
        # hàng nên từng trả lời sai hẳn, coi như khách chưa đặt gì — bug tìm thấy khi
        # test thật (hỏi "tổng nhiêu tiền vậy" sau khi đã có giỏ hàng).
        if any(k in s for k in ("tong tien", "nhieu tien", "gia bao nhieu", "het bao nhieu")):
            if not sess["cart"]:
                return _cart_summary(sess)
            total = sum(it["line_total"] for it in sess["cart"])
            return [_msg(f"Dạ tạm tính hiện tại là *{data.vnd(total)}* (chưa gồm phí ship) ạ. "
                         "Anh/chị chọn giúp em hình thức thanh toán nhé 👇",
                         [("💵 COD khi nhận", "PAY::COD khi nhận"), ("🏦 Chuyển khoản", "PAY::Chuyển khoản")])]

    # Đang ở bước XÁC NHẬN đơn cuối — khách gõ TAY đúng/gần chữ trên nút "✅ Gửi đơn"
    # thay vì bấm (payload nút là 'SUBMIT', không phải chữ hiển thị).
    if state == "REVIEW" and low in (
            "gui don", "gửi đơn", "xac nhan", "xác nhận", "xac nhan don",
            "xác nhận đơn", "dong y", "đồng ý", "ok", "oke", "chot don", "chốt đơn"):
        return _submit(sess)

    # Gõ CHỮ có mã đơn (vd 'tra đơn DH1026', 'DH1026') → tra thẳng, không hỏi xác minh.
    # Mã đơn thật của Commerce là 'DH<số>' (xem store._next_order_id) — 'BQ' là mã đơn sỉ
    # của dự án BQ cũ, sai chỗ này khiến khách gõ đúng mã đơn thật vẫn không tra được.
    # Guard bằng store.get_order để không nhầm mã sản phẩm (vd DH... trùng phần mã khác).
    mo = re.search(r"\bDH\s*\d{3,}\b", text, re.I)
    if mo:
        oid = re.sub(r"\s+", "", mo.group(0)).upper()
        if store.get_order(oid, sid):
            return _track(sess, oid)

    # Gõ thẳng mã sản phẩm / tên danh mục ở bước duyệt (chấp nhận gõ tắt/có chữ dẫn)
    if text.upper() in _prods(sess):
        resolved = text.upper()
        return (_try_direct_add(sess, resolved, text)
                or (_show_size_grid(sess, resolved) if _has_size(sess) else _show_qty(sess, resolved)))
    code_hits = _find_code_candidates(sess, text)
    if len(code_hits) > 1:                          # gõ mã mập mờ (nhiều màu) -> hỏi lại rõ
        return _ambiguous_code_prompt(sess, code_hits)
    if len(code_hits) == 1:
        resolved = code_hits[0]
        return (_try_direct_add(sess, resolved, text)
                or (_show_size_grid(sess, resolved) if _has_size(sess) else _show_qty(sess, resolved)))
    if text in stores.categories(sid):
        return _show_products(text, sid, sess)

    # Hỏi về size của mẫu vừa xem/đặt ('còn size khác không', 'size nào') mà KHÔNG kèm
    # số cụ thể → hiện lại bảng size của đúng mẫu đó, thay vì trả lời chung chung.
    sload = assistant._strip(text)
    if ("size" in sload and not re.search(r"\d{2}", sload)
            and sess.get("pending_product") in _prods(sess)):
        return _show_size_grid(sess, sess["pending_product"])

    # Chat tự nhiên ra đơn (nếu đủ mẫu + size + số lượng) → thêm giỏ + tóm tắt
    order = _try_nl_order(sess, text)
    if order:
        return order

    # Còn lại: TƯ VẤN bằng AI bán lẻ (giá, size, ship, thanh toán…)
    return _ai_reply(sess, text)
