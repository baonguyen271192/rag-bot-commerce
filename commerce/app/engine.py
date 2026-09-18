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
import time
import unicodedata

from . import data, store, assistant, stores

# URL public của web app (qua tunnel) — để bấm ảnh trên Messenger mở trang sản phẩm
# có gallery đầy đủ. Đặt trong .env: PUBLIC_BASE_URL=https://....trycloudflare.com
# Đọc lúc GỌI (không phải import) vì load_dotenv() chạy sau khi import engine.
def _public_base() -> str:
    return os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")

SESSIONS: dict[str, dict] = {}

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


def _add_food_to_cart(sess: dict, code: str, qty: int) -> list[dict]:
    p = _prods(sess)[code]
    unit = _unit(sess)
    if qty <= 0:
        return [_msg(f"Dạ số lượng chưa hợp lệ ạ. Anh/chị nhắn số {unit} muốn đặt nhé (ví dụ: `2`).")]
    qty = min(qty, 99)
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
    for it in cart:
        lines.append(f"• {_item_label(it)}\n  {_qty_detail(it, sess)} = {data.vnd(it['line_total'])}")
        subtotal += it["line_total"]
    lines.append(f"\nTạm tính: *{data.vnd(subtotal)}* (chưa gồm phí ship)")
    qr = [("✅ Đặt hàng", "CHECKOUT"), ("➕ Thêm sản phẩm", "MENU_ORDER"),
          ("🗑️ Xoá giỏ", "CLEAR_CART")]
    return [_msg("\n".join(lines), qr)]


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
    sess["state"] = "INFO"
    sess["customer"] = {"name": "", "phone": "", "address": ""}   # thu thập lại từ đầu cho rõ ràng
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


def _submit(sess: dict) -> list[dict]:
    if not sess["cart"]:
        return _cart_summary(sess)
    cart = sess["cart"]
    cus = sess["customer"]
    subtotal = sum(it["line_total"] for it in cart)

    order = store.create_retail_order(
        items=cart, subtotal=subtotal,
        customer={"name": cus["name"], "phone": cus["phone"], "address": cus["address"],
                  "fb_psid": sess.get("psid")},
        # Ghi ĐÚNG kênh khách đặt qua (câu 9 — dùng bộ giá trị CHANNEL_TYPES của
        # stores.py: "facebook"/"zalo_oa"/"zalo_personal"), không hardcode "facebook"
        # nữa (trước đây MỌI đơn — kể cả qua kênh khác — đều bị ghi nhầm "facebook").
        payment=sess["payment"], channel=sess.get("channel", "facebook"),
        created_at=time.strftime("%d/%m/%Y %H:%M"),
        store_id=sess.get("store_id", "default"),
    )
    oid = order["id"]
    pay = sess["payment"]
    sess["my_orders"].append(oid)
    # reset để có thể đặt tiếp (giữ tên/địa chỉ cho tiện đặt lần sau)
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


def _try_nl_order(sess: dict, text: str) -> list[dict] | None:
    """Chat tự nhiên RA ĐƠN: '2 đôi sandal size 40', 'mua Flame 40:2, 41:1'.
    Khớp mẫu + size + số lượng → thêm vào giỏ (tái dùng _add_to_cart). Trả None nếu
    không phải ý đặt hàng (để rơi xuống trợ lý tư vấn)."""
    s = assistant._strip(text)
    prod = assistant._match_product({"products": list(_prods(sess).values())}, s)
    if not prod:
        return None
    code = prod["code"]
    # Bỏ chính mã sản phẩm khỏi chuỗi để chữ số trong mã (vd 'SDG0141') KHÔNG bị đọc thành size.
    s_size = s.replace(code.lower(), " ")
    store_id = sess.get("store_id", "default")
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
    """Khách đang than phiền — tự tra đơn GẦN NHẤT của khách qua PSID (không cần khách
    gõ lại mã đơn) và gắn cờ để shop thấy nổi bật trong admin. Trả về mã đơn nếu gắn
    được, None nếu khách chưa có đơn nào (không có gì để gắn cờ)."""
    orders = store.list_orders_by_psid(sess.get("psid"), sess.get("store_id"))
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
        intro = _msg("Dạ đây là các lựa chọn phù hợp ạ 👇 Bấm *🛒 Chọn* trên mục anh/chị thích để đặt nhé.")
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
    if low in ("dat hang", "đặt hàng", "checkout", "thanh toan", "thanh toán",
               "xac nhan don", "xác nhận đơn", "chot don", "chốt đơn"):
        return _start_checkout(sess)
    # Lời chào ở BẤT KỲ trạng thái nào → về menu (không bị hiểu nhầm là nhập size).
    if _is_greeting(low):
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
    if text == "CLEAR_CART":
        sess["cart"] = []
        return [_msg("Đã xoá giỏ hàng.")] + _main_menu()
    if text == "SUBMIT":
        return _submit(sess)
    if text == "MENU":
        sess["state"] = "MENU"
        return _main_menu()

    state = sess["state"]

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
        m = re.search(r"\d+", text.replace(".", "").replace(",", ""))
        qty = int(m.group()) if m else 0
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
            return [_msg(f"Dạ em chưa rõ size ạ 😅 Anh/chị nhắn giúp em, ví dụ `{a1}` (1 {_unit(sess)} size {a1}), "
                         f"`{a1} lấy 2 {_unit(sess)}`, hoặc nhiều size `{a1}:1, {a2}:2` nhé.")]
        return _add_to_cart(sess, code, qtys)

    # Thu thập thông tin giao hàng trong 1 tin (text là DỮ LIỆU, không route AI).
    if state == "INFO":
        cus = sess["customer"]
        got = _parse_delivery(text)
        if got["phone"]:
            cus["phone"] = got["phone"]
        if got["name"] and not cus.get("name"):
            cus["name"] = got["name"]
        if got["address"] and not cus.get("address"):
            cus["address"] = got["address"]
        # Tin không có SĐT → coi là bổ sung đúng ô còn thiếu (địa chỉ trước, rồi tên).
        if not got["phone"]:
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
    if state == "PAYMENT":
        if low in ("chuyen khoan", "chuyển khoản", "ck", "banking"):
            if not sess["cart"]:
                return _cart_summary(sess)
            sess["payment"] = "Chuyển khoản"
            return _review(sess)
        if low in ("cod", "tien mat", "tiền mặt", "thanh toan khi nhan",
                   "thanh toán khi nhận", "tra tien khi nhan", "trả tiền khi nhận"):
            if not sess["cart"]:
                return _cart_summary(sess)
            sess["payment"] = "COD khi nhận"
            return _review(sess)

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
        return _show_size_grid(sess, resolved) if _has_size(sess) else _show_qty(sess, resolved)
    code_hits = _find_code_candidates(sess, text)
    if len(code_hits) > 1:                          # gõ mã mập mờ (nhiều màu) -> hỏi lại rõ
        return _ambiguous_code_prompt(sess, code_hits)
    if len(code_hits) == 1:
        resolved = code_hits[0]
        return _show_size_grid(sess, resolved) if _has_size(sess) else _show_qty(sess, resolved)
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
