import { bizOf } from '../lib/business'

// Ô "Cửa hàng" (avatar theo ngành + tên + nhãn ngành) — dùng chung cho cả 3 trang
// kênh tổng hợp, khớp cột "Cửa hàng" trong docs/channels-ia-mockup.html.
// Icon/nhãn ngành lấy từ lib/business.js (nguồn DUY NHẤT) — trước đây file này tự định
// nghĩa 1 bản sao riêng chỉ có 2/7 ngành, thêm ngành mới ở business.js sẽ không tự cập
// nhật ở đây, hiện đủ ngành cho mọi màn hình cùng lúc.
export default function ChannelStoreCell({ store }) {
  const biz = bizOf(store)
  const Icon = biz.icon
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fg/[0.06] text-fg/70">
        <Icon size={16} />
      </span>
      <div>
        <div className="text-sm font-medium text-fg">{store.name}</div>
        <div className="text-xs text-fg3">
          {biz.label}
          {store.plan_label && <> · {store.plan_label}</>}
        </div>
      </div>
    </div>
  )
}
