"""Registry NGÀNH HÀNG — nguồn sự thật DUY NHẤT cho: nhãn hiển thị, mặc định biến thể/
đơn vị, CHÍNH SÁCH mặc định (không hardcode theo 1 quán cụ thể như trước — xem lịch sử:
mọi store 'food' từng bị gán cứng nguyên văn chính sách của quán demo 'chao', kể cả câu
"giao tận nội thành Đà Nẵng" cho quán ở tỉnh khác), và đoạn HƯỚNG DẪN GIỌNG AI riêng ngành
(`ai_persona`, nối thêm vào system prompt gốc trong assistant.py) — để chọn đúng ngành lúc
tạo cửa hàng là AI đã tự đổi cách tư vấn theo đúng ngành đó, không bắt chủ shop tự viết
prompt tay mới có tác dụng.

Thêm 1 ngành mới = thêm 1 entry ở `BUSINESS_TYPES` bên dưới — `stores.py` (mặc định lúc
tạo), `assistant.py` (giọng AI), và `GET /api/admin/business-types` (frontend đọc để vẽ
danh sách, không hardcode 2 nút trên UI nữa) đều tự động ăn theo, không cần sửa thêm.
"""

from __future__ import annotations

BUSINESS_TYPES: dict[str, dict] = {
    "food": {
        "label": "Ăn uống",
        "hint": "Đặt theo món/phần",
        "variant_mode": "khong_co",
        "unit": "phần",
        "policies": {
            "van_chuyen": "Giao hàng trong khu vực quán phục vụ — phí và thời gian giao cụ "
                          "thể sẽ báo khi chốt đơn theo địa chỉ.",
            "thanh_toan": "Thanh toán tiền mặt khi nhận (COD) hoặc chuyển khoản.",
            "doi_tra": "Nếu món có vấn đề (nguội, sai món, thiếu món), báo ngay cho quán "
                      "trong vòng 30 phút để được đổi/hỗ trợ.",
        },
        "ai_persona": (
            "Đây là quán ăn/đồ ăn. Khi tư vấn: hỏi SỐ LƯỢNG phần khách muốn (không hỏi "
            "size trừ khi món thật sự có size). Có thể gợi ý món ăn kèm nếu phù hợp. "
            "Không nói về tồn kho lâu dài — món hết trong ngày là bình thường, không phải "
            "lỗi hệ thống."
        ),
    },
    "drink": {
        "label": "Đồ uống/Cà phê",
        "hint": "Trà sữa, cà phê, sinh tố...",
        "variant_mode": "nhan",
        "variant_labels": ["S", "M", "L"],
        "unit": "ly",
        "policies": {
            "van_chuyen": "Giao trong khu vực phục vụ — phí và thời gian giao báo khi chốt "
                          "đơn theo địa chỉ.",
            "thanh_toan": "Thanh toán tiền mặt khi nhận (COD) hoặc chuyển khoản.",
            "doi_tra": "Nếu pha sai món/thiếu topping, báo ngay trong 15 phút để được đổi lại.",
        },
        "ai_persona": (
            "Đây là quán đồ uống. Khi tư vấn: hỏi rõ SIZE LY (S/M/L nếu mẫu có), mức "
            "đường/đá nếu khách không nói rõ, và gợi ý topping thêm nếu phù hợp. Không "
            "nhắc chuyện giày dép/quần áo/size cơ thể."
        ),
    },
    "shoe": {
        "label": "Giày/Dép",
        "hint": "Đặt theo size",
        "variant_mode": "so",
        "variant_min": 24,
        "variant_max": 46,
        "unit": "đôi",
        "policies": {
            "van_chuyen": "Giao hàng toàn quốc, phí ship tính khi chốt đơn theo địa chỉ.",
            "thanh_toan": "Thanh toán COD (trả tiền khi nhận) hoặc chuyển khoản trước.",
            "doi_tra": "Đổi trong 7 ngày nếu hàng còn mới, chưa qua sử dụng, còn hộp và "
                      "tem. Lỗi nhà sản xuất đổi/hoàn miễn phí.",
        },
        "ai_persona": (
            "Đây là shop giày/dép. Khi tư vấn: LUÔN hỏi rõ size trước khi chốt đơn, nhắc "
            "khách nếu mẫu có nhiều màu. Có thể hỏi khách đi chân to/nhỏ hơn size thường "
            "để gợi ý size phù hợp nếu khách phân vân."
        ),
    },
    "fashion": {
        "label": "Thời trang/Quần áo",
        "hint": "Đặt theo size chữ",
        "variant_mode": "nhan",
        "variant_labels": ["S", "M", "L", "XL"],
        "unit": "cái",
        "policies": {
            "van_chuyen": "Giao hàng toàn quốc, phí ship tính khi chốt đơn theo địa chỉ.",
            "thanh_toan": "Thanh toán COD (trả tiền khi nhận) hoặc chuyển khoản trước.",
            "doi_tra": "Đổi trong 7 ngày nếu hàng còn mới, chưa giặt/sử dụng, còn tem mác.",
        },
        "ai_persona": (
            "Đây là shop thời trang/quần áo. Khi tư vấn: hỏi rõ size chữ (S/M/L/XL), có "
            "thể hỏi thêm chiều cao/cân nặng nếu khách phân vân giữa 2 size, và nhắc chất "
            "liệu vải nếu dữ liệu sản phẩm có mô tả."
        ),
    },
    "cosmetics": {
        "label": "Mỹ phẩm/Làm đẹp",
        "hint": "Đặt theo sản phẩm, không có size",
        "variant_mode": "khong_co",
        "unit": "hộp",
        "policies": {
            "van_chuyen": "Giao hàng toàn quốc, phí ship tính khi chốt đơn theo địa chỉ.",
            "thanh_toan": "Thanh toán COD (trả tiền khi nhận) hoặc chuyển khoản trước.",
            "doi_tra": "Đổi trong 3 ngày nếu sản phẩm còn nguyên seal, chưa bóc dùng. "
                      "Không nhận đổi/trả sản phẩm đã mở seal trừ lỗi nhà sản xuất.",
        },
        "ai_persona": (
            "Đây là shop mỹ phẩm/làm đẹp. Khi tư vấn: có thể hỏi loại da (da dầu/da khô/"
            "da hỗn hợp) nếu khách phân vân chọn sản phẩm, nhắc hạn sử dụng/cách bảo quản "
            "nếu dữ liệu có. TUYỆT ĐỐI không đưa ra cam kết công dụng y tế/điều trị không "
            "có trong dữ liệu sản phẩm."
        ),
    },
    "grocery": {
        "label": "Tạp hoá/Bách hoá",
        "hint": "Đặt theo đơn vị lẻ/thùng",
        "variant_mode": "nhan",
        "variant_labels": ["Lẻ", "Thùng"],
        "unit": "lẻ",
        "policies": {
            "van_chuyen": "Giao trong khu vực phục vụ — phí và thời gian giao báo khi chốt "
                          "đơn theo địa chỉ.",
            "thanh_toan": "Thanh toán tiền mặt khi nhận (COD) hoặc chuyển khoản.",
            "doi_tra": "Đổi trong 24h nếu hàng lỗi/hết hạn, cần giữ lại hoá đơn/bao bì.",
        },
        "ai_persona": (
            "Đây là cửa hàng tạp hoá/bách hoá. Khi tư vấn: hỏi rõ khách mua LẺ hay THÙNG "
            "nếu sản phẩm có cả 2 lựa chọn, vì giá/đơn vị khác nhau đáng kể."
        ),
    },
    "service": {
        "label": "Dịch vụ (theo lịch)",
        "hint": "Đặt lịch, không có tồn kho",
        "variant_mode": "khong_co",
        "unit": "lượt",
        "policies": {
            "van_chuyen": "Không áp dụng — đây là dịch vụ tại chỗ/theo lịch hẹn, không "
                          "giao hàng vật lý.",
            "thanh_toan": "Thanh toán khi sử dụng dịch vụ (tiền mặt hoặc chuyển khoản).",
            "doi_tra": "Muốn đổi/huỷ lịch hẹn, báo trước ít nhất 2 tiếng.",
        },
        "ai_persona": (
            "Đây là dịch vụ đặt theo LỊCH HẸN, không phải bán hàng vật lý. Khi tư vấn: "
            "hỏi rõ khách muốn đặt ngày/giờ nào thay vì hỏi số lượng/size. Không nhắc tồn "
            "kho hay giao hàng."
        ),
    },
}

DEFAULT_BUSINESS_TYPE = "food"


def get(business_type: str | None) -> dict:
    return BUSINESS_TYPES.get(business_type or "", BUSINESS_TYPES[DEFAULT_BUSINESS_TYPE])


def list_types() -> list[dict]:
    """Cho admin UI vẽ danh sách ngành — KHÔNG hardcode ở frontend nữa, thêm ngành mới ở
    đây là admin thấy ngay, không cần sửa/build lại React riêng cho phần chọn ngành."""
    return [
        {
            "key": key,
            "label": cfg["label"],
            "hint": cfg["hint"],
            "variant_mode": cfg["variant_mode"],
            "unit": cfg["unit"],
            "variant_min": cfg.get("variant_min", 24),
            "variant_max": cfg.get("variant_max", 46),
            "variant_labels": cfg.get("variant_labels", []),
        }
        for key, cfg in BUSINESS_TYPES.items()
    ]
