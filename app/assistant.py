"""Trợ lý tư vấn cho KHÁCH (bot Facebook/Zalo) — Commerce.

Chỉ dùng dữ liệu SẢN PHẨM/MÓN + giá + chính sách của ĐÚNG cửa hàng (store_id).
Không có khái niệm đại lý/công nợ — đây là engine bán lẻ/đặt đơn thuần tuý,
dùng chung cho mọi ngành (giày, quán ăn, ...).

LLM: ưu tiên Groq (nhanh, free) → Gemini → luật local (luôn chạy được, không cần API).
"""
from __future__ import annotations

import os
import re
import unicodedata
from datetime import datetime

from . import business_types, data, stores


def _strip(s: str) -> str:
    """Bỏ dấu + lowercase để so khớp từ khoá tiếng Việt."""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower().replace("đ", "d")


def _norm_nl(text: str) -> str:
    """Chuẩn hoá xuống dòng do LLM đôi lúc xuất literal '\\n' (2 ký tự) thay vì newline thật.
    Lớp phòng thủ thứ 2 chống dấu markdown lộ ra với khách: dù đã dặn AI không dùng
    **/*/#, nó vẫn không tuân thủ 100% (tuỳ lượt) — bóc các ký hiệu này, giữ chữ bên
    trong, vì Messenger hiển thị nguyên văn dấu sao/thăng, không render đậm/heading."""
    if not text:
        return text
    text = text.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\\t", " ")
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"__(.+?)__", r"\1", text)
    text = re.sub(r"(?<!\w)\*(\S(?:.*?\S)?)\*(?!\w)", r"\1", text)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    return text


def _match_category(s: str, store_id: str = "default"):
    """Nhận diện category khi khách chat tự do — dựa vào ĐÚNG danh sách category của
    CHÍNH store đó (admin tự đặt tên khi thêm sản phẩm), không hardcode từ khoá riêng
    ngành nào (trước đây chỉ hiểu 'Giày Nam/Nữ/Trẻ Em') — tự đúng cho MỌI ngành, chỉ
    cần category đã được đặt tên trong catalog của store."""
    cats = stores.categories(store_id)
    fallback = None
    for cat in cats:
        cat_s = _strip(cat)
        if not cat_s:
            continue
        if cat_s in s:
            return cat                                # khớp cả cụm — tin nhất, trả ngay
        toks = cat_s.split()
        if toks and all(t in s for t in toks) and fallback is None:
            fallback = cat                             # khớp đủ từ nhưng không liền cụm
    return fallback


# Từ MÀU trong câu (bỏ dấu) -> khớp với field 'color' THẬT của catalog (không đoán qua
# tên sản phẩm — tránh đụng độ kiểu 'hồng' bị lẫn với từ khác sau khi bỏ dấu).
_COLOR_WORDS = ("den", "nau", "kem", "xam", "trang", "bo", "xanh", "do", "hong",
                "bac", "vang", "cam", "tim", "reu", "dong", "chi")
# Nhãn hiển thị đẹp khi cần nhắc lại từ màu với khách (vd báo "chưa có màu X").
_COLOR_LABEL = {"den": "đen", "nau": "nâu", "kem": "kem", "xam": "xám", "trang": "trắng",
                "bo": "bò", "xanh": "xanh", "do": "đỏ", "hong": "hồng", "bac": "bạc",
                "vang": "vàng", "cam": "cam", "tim": "tím", "reu": "rêu", "dong": "đồng",
                "chi": "chì"}


def _match_color(s: str) -> str | None:
    """Tìm từ màu trong câu hỏi (khớp CẢ TỪ, tránh đụng độ chữ ngắn). Trả về từ màu đã
    bỏ dấu (vd 'hong') để so khớp substring với field color đã bỏ dấu của catalog."""
    toks = set(s.split())
    for w in _COLOR_WORDS:
        if w in toks:
            return w
    return None


def _color_matches(product_color: str, color_word: str) -> bool:
    return color_word in _strip(product_color)


# Bảng keyword cũ (cứu cánh) — để trống vì catalog mới tách theo màu, mã gốc không còn
# tồn tại nguyên dạng (vd 'GBW0295' nay là 'GBW0295-TRANG'/'GBW0295-DEN'...).
_PRODUCT_KW: dict = {}

# Từ chung (không đặc trưng) — bỏ qua khi khớp theo TÊN để không match nhầm mọi mẫu.
# Gồm cả _COLOR_WORDS: từ màu KHÔNG được dùng để khớp tên (vd 'trắng'~'thời trang',
# 'bạc'~'ánh bạc' trong tên chỉ là mô tả kiểu dáng, không phải tín hiệu tên sản phẩm —
# màu đã có đường khớp riêng qua field 'color' thật, đáng tin hơn nhiều).
_NAME_STOP = {"giay", "dep", "sandal", "nu", "nam", "tre", "em", "be", "quai", "ngang",
              "cheo", "mui", "vuong", "di", "hoc", "bq", "mau", "doi", "size", "cao", "got",
              "the", "thao", "bup", "cong", "so", "bit",
              "co", "khong", "cho", "xem", "ban", "con", "gia", "bao", "nhieu", "nao", "gi",
              "list", "danh", "sach", "tat", "ca", "cac", "voi", "muon", "minh", "toi", "shop",
              "la", "va", "hay", "cua", "moi", "loai", "kieu", "duoc", "a", "oi", "day", "them",
              "hang", "dang", "nhung", "hien", "deu", "van", "gio", "nay", "con", "het", "cung"
              } | set(_COLOR_WORDS)


def _match_products_by_name(s: str, limit: int = 10, products=None, min_score: int = 2) -> list:
    """Khớp sản phẩm theo TÊN thật. Chỉ nhận token >=3 ký tự để tránh đụng độ.
    min_score=2 (mặc định): cần khớp ÍT NHẤT 2 từ, không nhận khớp 1 từ đơn lẻ — vì tiếng
    Việt bỏ dấu dễ đụng độ (câu tào lao 'mấy giờ' -> 'may gio' trùng chữ 'may' trong
    'xỏ chân MAY viền'; 'chán vậy' -> 'chan vay' trùng chữ 'chan' trong 'xỏ CHÂN') — khớp 1
    từ không đủ tin cậy để khoá vào 1 sản phẩm cụ thể hay bật cả carousel."""
    q = [t for t in re.split(r"\s+", s) if len(t) >= 3 and t not in _NAME_STOP]
    if not q:
        return []
    pool = products or []
    scored = []
    for p in pool:
        toks = _strip(p["name"]).split()
        score = sum(1 for t in q if t in toks)
        if score >= min_score:
            scored.append((score, p["code"]))
    scored.sort(key=lambda x: -x[0])
    return [c for _, c in scored[:limit]]


def _match_sku_exact(ctx: dict, s: str):
    """CHỈ khớp mã SKU gõ thẳng trong câu (tin tuyệt đối). Không đoán theo tên —
    dùng làm bước ưu tiên cao nhất trước khi xét danh mục/màu, để câu duyệt danh sách
    ('bé gái màu hồng') không bị fuzzy-name khoá nhầm vào 1 sản phẩm cụ thể."""
    valid = {p["code"]: p for p in ctx["products"]}
    toks = set(re.findall(r"[a-z0-9]+", s))
    for code, p in valid.items():
        if any(ch.isdigit() for ch in code) and code.lower() in toks:
            return p
    return None


def _match_code_prefix(ctx: dict, s: str) -> list:
    """Khớp mã gõ TẮT (thiếu phần -MÀU, vd 'S0226' thay vì 'S0226-10-KEM') — tìm token
    có chữ+số trong câu, đối chiếu TIỀN TỐ với mã catalog. Trả list các mẫu khớp (rỗng
    nếu không có/không tìm được token giống mã) — khớp nhiều thì để nơi gọi tự quyết
    liệt kê hết hay coi là mập mờ, hàm này không tự chọn 1."""
    pool = ctx["products"]
    toks = [t for t in re.findall(r"[a-z0-9]+(?:-[a-z0-9]+)*", s)
            if len(t) >= 3 and any(ch.isdigit() for ch in t)]
    for t in toks:
        hits = [p for p in pool if p["code"].lower().startswith(t)]
        if hits:
            return hits
    return []


def _match_product(ctx: dict, s: str):
    valid = {p["code"]: p for p in ctx["products"]}
    hit = _match_sku_exact(ctx, s)
    if hit:
        return hit
    # 1) Khớp theo TÊN thật trong catalog của ctx.
    byname = _match_products_by_name(s, 1, ctx["products"])
    if byname and byname[0] in valid:
        return valid[byname[0]]
    # 2) Cứu cánh: bảng keyword cũ — chỉ nhận khi mã còn trong catalog hiện tại.
    scores = {c: sum(1 for k in kws if k in s) for c, kws in _PRODUCT_KW.items() if c in valid}
    if scores:
        best = max(scores, key=scores.get)
        if scores[best] > 0:
            return valid[best]
    return None


def _parse_sizes(s: str, store_id: str = "default") -> list[str]:
    """Tìm size/biến thể khách gõ trong câu — theo ĐÚNG kiểu cấu hình của CHÍNH store
    (số trong 1 dải tự đặt, hay danh sách nhãn tự đặt như S/M/L/128GB), không hardcode
    dải giày 24-46 nữa — để dùng được cho nhiều ngành khác giày qua cấu hình admin,
    không cần sửa code."""
    st = stores.get(store_id)
    if st.get("variant_mode") == "nhan":
        labels = st.get("variant_labels") or []
        up = s.upper()
        return [lb for lb in labels
                if re.search(rf"(?<![A-Z0-9]){re.escape(lb.upper())}(?![A-Z0-9])", up)]
    lo, hi = st.get("variant_min", 24), st.get("variant_max", 46)
    found = set()
    for a, b in re.findall(r"(\d{2})\s*[-–>]\s*(\d{2})", s):
        a, b = int(a), int(b)
        if lo <= a <= hi and lo <= b <= hi and a <= b:
            for n in range(a, b + 1):
                found.add(str(n))
    tmp = re.sub(r"(\d{2})\s*[-–>]\s*(\d{2})", " ", s)
    tmp = re.sub(r"\d+\s*(?:doi|dep|cai)\b", " ", tmp)
    tmp = re.sub(r"m[oô]i\s*size\s*\d+", " ", tmp)
    for n in re.findall(r"\d{2}", tmp):
        if lo <= int(n) <= hi:
            found.add(n)
    return sorted(found)


def _parse_qty(s: str):
    m = re.search(r"m[oô]i\s*size\s*(\d+)", s)
    if m:
        return int(m.group(1))
    m = re.search(r"(\d+)\s*(?:doi|d[eé]p|cai)\b", s)
    if m:
        return int(m.group(1))
    return None


def _is_create_intent(s: str, store_id: str = "default") -> bool:
    verbs = ["dat ", "dat mua", "dat don", "lay ", "mua ", "nhap ", "order", "can mua",
             "cho toi", "cho minh", "cho anh", "cho chi", "muon lay", "muon dat", "len don"]
    has_verb = any(v in f" {s} " for v in verbs)
    has_target = _parse_sizes(s, store_id) or re.search(r"\d+\s*doi", s) or any(
        k in s for kws in _PRODUCT_KW.values() for k in kws)
    return bool(has_verb and has_target)


# ---------- LLM: Groq (chính) → Gemini (dự phòng) ----------

def _groq_raw(system_prompt: str, data_obj: dict, q: str) -> dict | None:
    """Gọi Groq (OpenAI-compatible). Nhanh, free thoáng. Trả dict JSON đã parse, hoặc None."""
    key = os.getenv("GROQ_API_KEY")
    if not key:
        return None
    model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    try:
        import json, urllib.request
        prompt = f"{system_prompt}\n\nDATA:\n{json.dumps(data_obj, ensure_ascii=False)}\n\nCâu hỏi: {q}"
        body = {"model": model, "temperature": 0.3,
                "response_format": {"type": "json_object"},
                "messages": [{"role": "user", "content": prompt}]}
        req = urllib.request.Request(
            "https://api.groq.com/openai/v1/chat/completions",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}",
                     "User-Agent": "Mozilla/5.0 (compatible; Commerce-Assistant/1.0)"})
        res = None
        for attempt in range(2):
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    res = json.loads(r.read().decode("utf-8"))
                break
            except Exception as e:
                if attempt == 1:
                    raise e
        text = res["choices"][0]["message"]["content"]
        text = re.sub(r"^```(?:json)?|```$", "", text.strip()).strip()
        return json.loads(text)
    except Exception as e:
        print(f"[assistant] Groq lỗi: {e}")
        return None


def _gemini_raw(system_prompt: str, data_obj: dict, q: str) -> dict | None:
    """LLM dùng chung: ưu tiên Groq → Gemini. Trả dict JSON đã parse, hoặc None."""
    g = _groq_raw(system_prompt, data_obj, q)
    if g is not None:
        return g
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        return None
    model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    try:
        import json, urllib.request
        prompt = f"{system_prompt}\n\nDATA:\n{json.dumps(data_obj, ensure_ascii=False)}\n\nCâu hỏi: {q}"
        body = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.3,
                                 "thinkingConfig": {"thinkingBudget": 0}},
        }
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
        req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"),
                                     headers={"Content-Type": "application/json"})
        res = None
        for attempt in range(2):
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    res = json.loads(r.read().decode("utf-8"))
                break
            except Exception as e:
                if attempt == 1:
                    raise e
        parts = res["candidates"][0]["content"]["parts"]
        text = "".join(p["text"] for p in parts if "text" in p)
        text = re.sub(r"^```(?:json)?|```$", "", text.strip()).strip()
        return json.loads(text)
    except Exception as e:
        print(f"[assistant] Gemini lỗi: {e}")
        return None


# ---------- Trợ lý KHÁCH (bot) ----------

RETAIL_POLICIES = {
    "van_chuyen": "Giao hàng toàn quốc. Phí ship tính khi chốt đơn theo địa chỉ.",
    "thanh_toan": "Thanh toán **COD** (trả tiền khi nhận) hoặc **chuyển khoản** trước.",
    "doi_tra": "Đổi/trả trong 7 ngày nếu hàng còn mới, lỗi nhà sản xuất đổi/hoàn miễn phí.",
}


def _retail_products(question: str, store_id: str = "default") -> list[dict]:
    """Gọn + cap để không vượt payload LLM (catalog lớn, tới 600+ mẫu). Nếu câu hỏi có
    tín hiệu category/màu rõ (giống luật cứng vẫn dùng để lọc), LỌC TRƯỚC theo đó rồi mới
    cắt 45 — để AI thấy đúng nhóm khách hỏi, không chỉ 45 mẫu đầu catalog theo thứ tự
    cố định (mất recall với catalog lớn, dù AI vẫn tự quyết có gợi ý hay không)."""
    s = _strip(question)
    pool = list(stores.products(store_id).values())
    cat = _match_category(s, store_id)
    if cat:
        pool = [p for p in pool if p["category"] == cat] or pool
    color = _match_color(s)
    if color:
        narrowed = [p for p in pool if _color_matches(p.get("color", ""), color)]
        if narrowed:
            pool = narrowed
    return [{"code": p["code"], "name": p["name"], "category": p["category"],
             "color": p.get("color", ""), "price": p["retail"],
             "con_size": [s for s, n in p["sizes"].items() if n > 0]}
            for p in pool[:45]]


_RETAIL_SYS = (
    "Bạn là nhân viên tư vấn bán hàng của một cửa hàng, nhắn tin với KHÁCH trên Facebook. "
    "CHỈ dùng dữ liệu trong DATA (JSON sản phẩm/món: tên, màu 'color', giá 'price', lựa chọn "
    "còn hàng 'con_size'; 'today' là ngày giờ THẬT hiện tại — dùng field này nếu khách hỏi "
    "ngày/giờ/hôm nay, KHÔNG tự đoán) và POLICIES, TUYỆT ĐỐI không bịa số liệu/sản phẩm/màu. "
    "Nếu khách hỏi theo MÀU, chỉ liệt kê đúng sản phẩm có field 'color' khớp, không đoán. "
    "Không nhắc tới giá sỉ, đại lý hay công nợ. "
    "Trả lời tiếng Việt, ngắn gọn, thân thiện. TUYỆT ĐỐI KHÔNG dùng ký hiệu markdown như "
    "**, *, _, # — Messenger không hiển thị được, khách sẽ thấy dấu sao/gạch dưới thừa "
    "y nguyên trong tin nhắn, chỉ viết chữ thường bình thường. Số tiền dạng 30.000₫. "
    "Nếu đang liệt kê 1 hay nhiều mẫu cụ thể kèm màu/size (đã đủ thông tin để đặt): LUÔN "
    "nêu rõ field 'code' của từng mẫu/màu và nói khách có thể gõ đúng mã đó để đặt ngay "
    "(vd 'gõ SD3638-49-HONG để đặt'). Nếu khách CHƯA rõ muốn mẫu nào (mới hỏi chung, chưa "
    "đủ chi tiết): trả lời ngắn, gợi ý khách xem thêm sản phẩm để chọn. TUYỆT ĐỐI KHÔNG "
    "nhắc lại nguyên văn tên nút (vd '🛒 Xem sản phẩm') trong câu chữ — nút đã hiện RIÊNG "
    "bên dưới tin nhắn rồi, nhắc lại trong câu sẽ bị trùng/thừa, đọc rất kỳ. "
    "Nếu khách đang THAN PHIỀN/báo lỗi về đơn đã đặt (giao sai, giao trễ, thiếu hàng, lỗi "
    "sản phẩm, không hài lòng...): xin lỗi ngắn gọn, xác nhận đã ghi nhận sẽ kiểm tra lại — "
    "KHÔNG gợi ý mua thêm sản phẩm nào cả trong tình huống này. "
    'CHỈ xuất JSON: {"answer": string, "chips"?: string[], "is_complaint"?: boolean}. '
    '"is_complaint": true nếu khách đang than phiền/báo lỗi về đơn đã đặt, ngược lại bỏ trống.'
)


def _retail_local_answer(q: str, store_id: str = "default") -> dict:
    """Trả lời tư vấn bằng luật (chạy được ngay, không cần API)."""
    s = _strip(q)
    pol = stores.get(store_id).get("policies", RETAIL_POLICIES)
    prods = stores.products(store_id)
    chips = ["🛒 Xem sản phẩm", "Còn size nào?", "Ship và thanh toán"]
    if any(k in s for k in ["ship", "giao", "van chuyen", "bao lau", "phi"]):
        return {"answer": pol["van_chuyen"], "chips": chips, "engine": "local"}
    if any(k in s for k in ["thanh toan", "cod", "chuyen khoan", "tra tien"]):
        return {"answer": pol["thanh_toan"], "chips": chips, "engine": "local"}
    if any(k in s for k in ["doi", "tra", "bao hanh", "loi"]):
        return {"answer": pol["doi_tra"], "chips": chips, "engine": "local"}

    fake_ctx = {"products": list(prods.values())}
    cat = _match_category(s, store_id)
    color = _match_color(s)
    # _match_product đã yêu cầu ≥2 từ khớp tên (an toàn), nên LUÔN thử trước category —
    # câu hỏi cụ thể về 1 mẫu ('...bé gái xỏ chân bao nhiêu') cần khớp đúng mẫu đó, không
    # để category ('bé gái' → cả nhóm Trẻ Em) cướp mất trước khi kịp thử khớp tên.
    prod = _match_product(fake_ctx, s)
    targets = [prod] if prod else (
        [p for p in prods.values() if p["category"] == cat] if cat else None)
    # Chưa tìm được gì qua mã/tên/danh mục -> thử khớp mã GÕ TẮT (thiếu phần -MÀU).
    if not targets and not cat:
        prefix_hits = _match_code_prefix(fake_ctx, s)
        if prefix_hits:
            targets = prefix_hits
    # Có ý màu mà chưa có mẫu/danh mục cụ thể -> lọc TOÀN catalog theo màu.
    if targets is None and color:
        targets = [p for p in prods.values() if _color_matches(p.get("color", ""), color)]
    elif targets is not None and color:
        # Đã có mẫu/danh mục rồi -> màu là điều kiện LỌC THÊM (AND), không thay thế.
        targets = [p for p in targets if _color_matches(p.get("color", ""), color)]
    if targets:
        lines = []
        for p in targets[:12]:
            in_stock = [sz for sz, n in p["sizes"].items() if n > 0]
            lines.append(f"• {p['code']} — {p['name']} — màu {p.get('color','')} — {data.vnd(p['retail'])}\n"
                         f"  Size còn: " + (", ".join(in_stock) if in_stock else "tạm hết"))
        # Dạy cú pháp gõ để đặt luôn (đã có đủ mã+size ở trên) — không bắt khách phải bấm
        # nút quay lại duyệt từ đầu khi đang nói chuyện tự nhiên.
        # Không nhắc nguyên văn tên nút ('🛒 Xem sản phẩm') — nút đã hiện riêng bên dưới
        # (chips), nhắc lại trong câu chữ sẽ bị trùng/thừa.
        tip = f"\n\nAnh/chị gõ đúng mã (vd {targets[0]['code']}) để em hỏi size/số lượng và đặt luôn, hoặc bấm nút bên dưới để xem ảnh trước."
        return {"answer": "\n".join(lines) + tip, "chips": chips, "engine": "local"}
    if color and not targets:
        return {"answer": f"Dạ hiện shop chưa có mẫu màu **{_COLOR_LABEL.get(color, color)}** phù hợp trong "
                          f"nhóm anh/chị hỏi ạ. Anh/chị xem các mẫu khác nhé.",
                "chips": chips, "engine": "local"}

    if any(k in s for k in ["gia", "bao nhieu", "list", "danh sach", "co gi", "san pham", "mau"]):
        lines = [f"• **{p['name']}** — {data.vnd(p['retail'])}" for p in list(prods.values())[:20]]
        return {"answer": "Shop đang có các mẫu:\n" + "\n".join(lines),
                "chips": chips, "engine": "local"}

    return {"answer": "Dạ mời anh/chị bấm **🛒 Xem sản phẩm** để xem và chọn, "
            "hoặc hỏi em về giá/món/ship nhé!",
            "chips": chips, "engine": "local"}


def _retail_match_codes(question: str, store_id: str = "default") -> list:
    """Mã sản phẩm khớp câu hỏi (để bot hiện CAROUSEL có ẢNH) — trong catalog store."""
    s = _strip(question)
    prods = stores.products(store_id)
    pool = list(prods.values())
    color = _match_color(s)

    def _filter_color(codes: list) -> list:
        """Lọc theo màu nếu khách có nêu màu. KHÔNG fallback về danh sách chưa lọc khi
        rỗng — thà báo 'chưa có màu này' (xem _retail_local_answer) còn hơn lặng lẽ
        đưa nhầm màu khác, khiến khách tưởng bot đã lọc đúng."""
        if not color:
            return codes
        return [c for c in codes if _color_matches(prods.get(c, {}).get("color", ""), color)]

    # 1) Mã SKU gõ thẳng → tin tuyệt đối, 1 kết quả (không qua lọc màu).
    sku_hit = _match_sku_exact({"products": pool}, s)
    if sku_hit:
        return [sku_hit["code"]]
    # 2) Khớp tên đặc trưng (yêu cầu ≥2 từ khớp — xem min_score trong
    #    _match_products_by_name — nên đã đủ an toàn để chạy TRƯỚC category: câu hỏi cụ
    #    thể về 1 mẫu ('giày thể thao bé gái xỏ chân bao nhiêu' → khớp đúng 2 từ 'gái'+
    #    'chân' vào đúng mẫu) không bị category ('bé gái' → cả nhóm Trẻ Em) cướp mất và
    #    trả nhầm 10 mẫu đầu category, bỏ qua mẫu khách đang hỏi cụ thể.
    byname = _match_products_by_name(s, 10, pool)
    if byname:
        return _filter_color(byname)[:10]
    # 3) Không khớp tên cụ thể -> danh mục (nam/nữ/trẻ em), lọc thêm theo màu nếu có.
    #    Đây là nhánh cho câu duyệt danh sách chung ('bé gái màu hồng' — chỉ còn 1 từ
    #    'gái' sau khi loại màu khỏi so khớp tên, không đủ 2 từ nên byname ở trên rỗng).
    cat = _match_category(s, store_id)
    if cat:
        codes = [p["code"] for p in pool if p["category"] == cat]
        return _filter_color(codes)[:10]
    if any(k in s for k in ("mau", "san pham", "co gi", "list", "danh sach", "xem giay",
                            "xem mau", "co nhung", "nhung mau", "tat ca", "giay", "dep", "sandal")):
        codes = [p["code"] for p in pool]
        return _filter_color(codes)[:10]
    # Chỉ hỏi màu, không kèm danh mục/tên -> lọc toàn catalog theo màu.
    if color:
        return [p["code"] for p in pool if _color_matches(p.get("color", ""), color)][:10]
    return []


_WEEKDAY_VI = ("Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật")


def _today_str() -> str:
    """Ngày giờ THẬT hiện tại (đọc từ đồng hồ server) — đưa vào DATA cho AI, không để
    AI tự đoán vì LLM không có khái niệm thời gian thực."""
    now = datetime.now()
    return f"{_WEEKDAY_VI[now.weekday()]}, {now.strftime('%d/%m/%Y %H:%M')}"


# tone lưu trên store (chọn lúc tạo/sửa cửa hàng) — TRƯỚC ĐÂY field này chỉ lưu vào DB,
# không hề được đọc ở đâu trong lúc build prompt AI, nên đổi tone trên admin không có tác
# dụng thật gì cả. Giờ dịch thành 1 câu hướng dẫn văn phong nối vào system prompt.
_TONE_INSTRUCTIONS = {
    "warm": "Xưng 'em', gọi khách 'anh/chị', nói chuyện ấm áp gần gũi, có thể dùng emoji "
            "nhẹ nhàng (😊, 🙏) vừa phải, không lạm dụng.",
    "professional": "Xưng 'shop' hoặc 'chúng tôi', gọi khách 'anh/chị' hoặc 'quý khách', "
                    "nói chuyện trang trọng, ngắn gọn, súc tích, hạn chế dùng emoji.",
}


def answer_retail(question: str, store_id: str = "default") -> dict:
    """Tư vấn khách theo catalog của store. Groq/Gemini nếu có, fallback luật local.
    Kèm product_codes để bot dựng carousel ảnh."""
    st = stores.get(store_id)
    pol = st.get("policies", RETAIL_POLICIES)
    sys_prompt = _RETAIL_SYS
    # Đặc thù ngành (registry business_types.py) — đây là chỗ khiến chọn "Ăn uống" hay
    # "Giày/Dép" lúc tạo cửa hàng THẬT SỰ đổi cách AI tư vấn (hỏi số phần hay hỏi size,
    # có gợi ý topping hay không...), thay vì trước đây mọi ngành dùng chung 1 prompt hệt
    # nhau và chỉ khác ở việc chủ shop có tự viết custom_prompt tay hay không.
    biz = business_types.get(st.get("business_type"))
    persona = biz.get("ai_persona", "")
    if persona:
        sys_prompt = f"{sys_prompt}\n\nĐẶC THÙ NGÀNH ({biz.get('label', '')}):\n{persona}"
    tone_note = _TONE_INSTRUCTIONS.get(st.get("tone"))
    if tone_note:
        sys_prompt = f"{sys_prompt}\n\nGIỌNG VĂN của cửa hàng này: {tone_note}"
    custom = (st.get("custom_prompt") or "").strip()
    if custom:
        # Nối THÊM sau rule gốc, không thay hẳn — giữ nguyên rule chống bịa dữ liệu dù
        # chủ shop tự viết prompt riêng (tone, quy tắc thêm) trong custom_prompt.
        sys_prompt = f"{sys_prompt}\n\nQUY TẮC RIÊNG của cửa hàng này (áp dụng thêm):\n{custom}"
    out = _gemini_raw(sys_prompt, {"products": _retail_products(question, store_id), "policies": pol,
                                    "today": _today_str()}, question)
    if out and out.get("answer"):
        # Chỉ dùng tín hiệu 'is_complaint' của AI để QUYẾT ĐỊNH có nên xét carousel hay
        # không (AI hiểu ngữ cảnh tốt — biết đây là than phiền dù câu nhắc tới màu).
        # Carousel THẬT vẫn dùng lại luật cứng cũ (_retail_match_codes, quét toàn catalog)
        # khi không phải than phiền — vì tự AI trả 'product_codes' trong JSON không ổn
        # định (đã test: cùng 1 câu, 2/3 lần AI quên điền dù trả lời chữ vẫn đúng).
        is_complaint = bool(out.get("is_complaint"))
        res = {"answer": _norm_nl(out["answer"]), "chips": out.get("chips", []), "engine": "ai",
               "is_complaint": is_complaint}
        if not is_complaint:
            codes = _retail_match_codes(question, store_id)
            if codes:
                res["product_codes"] = codes
        return res
    # AI lỗi/chưa cấu hình key -> nhánh dự phòng chạy luật cứng (hiếm khi tới đây).
    res = _retail_local_answer(question, store_id)
    res["answer"] = _norm_nl(res["answer"])  # local template cũng chèn '**' — bóc luôn
    codes = _retail_match_codes(question, store_id)
    if codes:
        res["product_codes"] = codes
    return res
