"""Registry GÓI DỊCH VỤ — mirror kiểu business_types.py: mỗi gói tự khai ĐẦY ĐỦ feature
set của chính nó (không phải diff so với gói dưới) — thêm gói mới/đổi feature 1 gói chỉ
sửa ở đây, main.py/stores.py không cần đụng.

TIERED/CỘNG DỒN: gói cao hơn CHỨA TOÀN BỘ feature của gói thấp hơn (basic ⊂ pro), không
phải các gói tách biệt không chồng nhau — đúng theo yêu cầu "mua gói A chỉ dùng A, mua
gói B dùng được cả A và B".
"""

from __future__ import annotations

PLANS: dict[str, dict] = {
    "internal_unlimited": {
        "label": "Nội bộ / demo (không giới hạn)",
        "order": 0,
        "features": {"facebook", "zalo_oa", "zalo_personal"},
    },
    "basic": {
        "label": "Basic",
        "order": 1,
        "features": {"facebook", "zalo_oa"},
    },
    "pro": {
        "label": "Pro",
        "order": 2,
        # Cộng dồn — chứa nguyên bộ feature của basic + thêm zalo_personal.
        "features": {"facebook", "zalo_oa", "zalo_personal"},
    },
}

DEFAULT_PLAN = "basic"


def get(plan_id: str | None) -> dict:
    return PLANS.get(plan_id or "", PLANS[DEFAULT_PLAN])


def has_feature(plan_id: str | None, feature_key: str) -> bool:
    return feature_key in get(plan_id).get("features", ())


def list_plans() -> list[dict]:
    """Cho admin UI vẽ picker khi tạo tenant/store — không hardcode ở frontend, thêm gói
    mới ở đây là admin thấy ngay, giống cách business_types.py phục vụ list_types()."""
    return [
        {"key": key, "label": cfg["label"], "features": sorted(cfg["features"])}
        for key, cfg in sorted(PLANS.items(), key=lambda kv: kv[1]["order"])
    ]
