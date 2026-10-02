import { Link } from 'react-router-dom'
import { MessageCircle, Send, Smartphone } from 'lucide-react'
import { badgeTone, BADGE_TONE_CLASS, channelCounts } from '../lib/channels'
import { storeSectionPath } from '../lib/store-nav'

const CHANNELS = [
  { key: 'facebook', label: 'Facebook', icon: Send },
  { key: 'zalo_personal', label: 'Zalo cá nhân', icon: Smartphone },
  { key: 'zalo_oa', label: 'Zalo OA', icon: MessageCircle },
]

// Dải tóm tắt 3 kênh ngay dưới KPI ở Tổng quan — CHỈ portal (xem gate ở OverviewPage.jsx):
// admin không còn mục "Kênh" nào để xem/sửa (mô hình phân quyền đã chốt, BA/PO — xem
// AppShell.jsx), nên dải này cũng không còn ý nghĩa cho admin. Với portal (đúng 1 cửa
// hàng), bấm vào nhảy thẳng tới tab "Kênh" của CHÍNH cửa hàng đó (/stores/:id/channels —
// nơi duy nhất còn sửa được kênh), KHÔNG còn trỏ tới 3 trang kênh tổng hợp đã xoá.
export default function ChannelHealthStrip({ stores }) {
  const storeId = stores?.[0]?.id
  return (
    <div className="card mb-7 grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {CHANNELS.map(({ key, label, icon: Icon }) => {
        const { active, total } = channelCounts(stores, key)
        const tone = badgeTone(active, total)
        return (
          <Link
            key={key}
            to={storeSectionPath(storeId, 'channels')}
            className="group flex items-center gap-3 p-4 transition-colors hover:bg-fg/[0.03] focus-visible:bg-fg/[0.03] focus-visible:outline-none"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fg/[0.06] text-fg/60 transition-colors group-hover:bg-indigo-500/15 group-hover:text-indigo-300">
              <Icon size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-fg">{label}</div>
              {/* Portal chỉ có 1 cửa hàng — nói "1/1 cửa hàng đã bật" là thừa-thông-tin
                  (số lượng cửa hàng không phải thứ chủ shop cần biết), chỉ cần biết kênh
                  này bật hay chưa. */}
              <div className="text-xs text-fg/55">{active > 0 ? 'Đã bật' : 'Chưa bật'}</div>
            </div>
            <span className={'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ' + BADGE_TONE_CLASS[tone]}>
              {active > 0 ? 'Bật' : 'Tắt'}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
