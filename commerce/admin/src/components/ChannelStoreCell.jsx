import { Footprints, ShoppingBag, Soup } from 'lucide-react'

const BUSINESS = {
  shoe: { label: 'Giày/Dép', icon: Footprints },
  food: { label: 'Ăn uống', icon: Soup },
}

// Ô "Cửa hàng" (avatar theo ngành + tên + nhãn ngành) — dùng chung cho cả 3 trang
// kênh tổng hợp, khớp cột "Cửa hàng" trong docs/channels-ia-mockup.html.
export default function ChannelStoreCell({ store }) {
  const biz = BUSINESS[store.business_type] || { label: store.business_type, icon: ShoppingBag }
  const Icon = biz.icon
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fg/[0.06] text-fg/70">
        <Icon size={16} />
      </span>
      <div>
        <div className="text-sm font-medium text-fg">{store.name}</div>
        <div className="text-xs text-fg3">{biz.label}</div>
      </div>
    </div>
  )
}
