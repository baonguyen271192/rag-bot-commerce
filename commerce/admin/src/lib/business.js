import { CalendarClock, Coffee, Footprints, Shirt, ShoppingBasket, Sparkles, Soup, Store } from 'lucide-react'

// Icon hiển thị theo ngành — KHÔNG phải nguồn sự thật về danh sách ngành (đó là backend,
// xem GET /api/admin/business-types và app/business_types.py). File này chỉ ánh xạ
// key -> icon cho những màn hình liệt kê cửa hàng (list/badge), dùng CHUNG 1 chỗ để
// không lặp lại định nghĩa này ở nhiều component rồi lệch nhau (từng xảy ra: đã có 1
// bản sao y hệt ở ChannelStoreCell.jsx tự định nghĩa riêng, chỉ có 2/7 ngành).
export const BUSINESS = {
  food: { label: 'Ăn uống', icon: Soup },
  drink: { label: 'Đồ uống/Cà phê', icon: Coffee },
  shoe: { label: 'Giày/Dép', icon: Footprints },
  fashion: { label: 'Thời trang/Quần áo', icon: Shirt },
  cosmetics: { label: 'Mỹ phẩm/Làm đẹp', icon: Sparkles },
  grocery: { label: 'Tạp hoá/Bách hoá', icon: ShoppingBasket },
  service: { label: 'Dịch vụ (theo lịch)', icon: CalendarClock },
}

// Icon mặc định cho 1 ngành backend đã có (business_types.py) nhưng frontend CHƯA kịp
// gán icon riêng — degrade về icon chung thay vì crash hay hiện trống, để thêm ngành mới
// ở backend không bắt buộc phải sửa frontend ngay mới chạy được.
export const DEFAULT_BIZ_ICON = Store

export function bizOf(store) {
  return BUSINESS[store.business_type] || { label: store.business_type, icon: DEFAULT_BIZ_ICON }
}
