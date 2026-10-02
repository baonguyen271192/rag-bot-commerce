import { ClipboardList, MessageSquare, Radio, Settings2, ShoppingBasket, Tag, Users } from 'lucide-react'

// 6 mục quản lý 1 cửa hàng — NGUỒN DUY NHẤT (trước đây chỉ sống trong mảng TABS cục bộ
// của trang chi tiết cửa hàng cũ, đã tách thành route riêng + xoá file gộp). `key` TRÙNG
// với segment URL (/stores/:id/<key>) và TRÙNG với giá trị query param `tab` cũ của URL
// trước khi tách route — nhờ vậy redirect tương thích ngược chỉ cần kiểm tra
// `isStoreSection()`, không cần bảng map riêng.
export const STORE_SECTIONS = [
  { key: 'config', label: 'Cấu hình', icon: Settings2 },
  { key: 'channels', label: 'Kênh', icon: Radio },
  { key: 'menu', label: 'Menu', icon: ShoppingBasket },
  { key: 'orders', label: 'Đơn hàng', icon: ClipboardList },
  { key: 'conversations', label: 'Hội thoại', icon: MessageSquare },
  { key: 'customers', label: 'Khách hàng', icon: Users },
  { key: 'coupons', label: 'Khuyến mãi', icon: Tag },
]

export const DEFAULT_STORE_SECTION = 'config'

export function isStoreSection(key) {
  return STORE_SECTIONS.some((s) => s.key === key)
}

// -> `/stores/${storeId}/${sectionKey}`. sectionKey không hợp lệ -> dùng mặc định.
// storeId rỗng/không phải chuỗi -> '/stores' (không sinh '/stores//config').
export function storeSectionPath(storeId, sectionKey) {
  if (typeof storeId !== 'string' || !storeId) return '/stores'
  const section = isStoreSection(sectionKey) ? sectionKey : DEFAULT_STORE_SECTION
  return `/stores/${storeId}/${section}`
}

// Đọc id cửa hàng đang xem từ pathname (KHÔNG kèm basename — react-router đã cắt).
// '/stores/new' KHÔNG phải 1 cửa hàng (trang tạo mới) -> null, dù khớp hình dạng
// '/stores/:id'.
export function storeIdFromPath(pathname) {
  if (typeof pathname !== 'string') return null
  const m = pathname.match(/^\/stores\/([^/]+)(?:\/.*)?$/)
  if (!m) return null
  const id = m[1]
  if (!id || id === 'new') return null
  return id
}
