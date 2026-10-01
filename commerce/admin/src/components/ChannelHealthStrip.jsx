import { Link } from 'react-router-dom'
import { MessageCircle, Send, Smartphone } from 'lucide-react'
import { badgeTone, BADGE_TONE_CLASS, channelCounts } from '../lib/channels'

const CHANNELS = [
  { key: 'facebook', label: 'Facebook', icon: Send, to: '/channels/facebook' },
  { key: 'zalo_personal', label: 'Zalo cá nhân', icon: Smartphone, to: '/channels/zalo-personal' },
  { key: 'zalo_oa', label: 'Zalo OA', icon: MessageCircle, to: '/channels/zalo-oa' },
]

// Dải tóm tắt 3 kênh ngay dưới KPI — lấp khoảng trống Tổng quan hay bị trống khi ít
// cửa hàng (xem feedback đã lưu: "đừng để dashboard trống nửa dưới"), đồng thời nối IA
// Tổng quan -> Kênh rõ ràng hơn thay vì chỉ có trong sidebar. Dùng lại đúng
// channelCounts()/badgeTone() đã có cho sidebar — không gọi thêm API nào.
export default function ChannelHealthStrip({ stores }) {
  return (
    <div className="card mb-7 grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {CHANNELS.map(({ key, label, icon: Icon, to }) => {
        const { active, total } = channelCounts(stores, key)
        const tone = badgeTone(active, total)
        return (
          <Link
            key={key}
            to={to}
            className="group flex items-center gap-3 p-4 transition-colors hover:bg-fg/[0.03] focus-visible:bg-fg/[0.03] focus-visible:outline-none"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fg/[0.06] text-fg/60 transition-colors group-hover:bg-indigo-500/15 group-hover:text-indigo-300">
              <Icon size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-fg">{label}</div>
              <div className="text-xs text-fg/55">{active}/{total} cửa hàng đã bật</div>
            </div>
            <span className={'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ' + BADGE_TONE_CLASS[tone]}>
              {active}/{total}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
