import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { bizOf } from '../lib/business'

// 'regression' (đã từng có đơn, giờ mất hết kênh sống) tô đỏ gạch — đang mất đơn thật,
// cần xử lý gấp hơn 'setup' (chưa từng lên sóng) vẫn giữ tông vàng nghệ. Vạch trái đậm
// (kiểu cuống vé/phiếu sự cố) thay cho viền mềm 4 cạnh — để mắt bắt được mức độ nghiêm
// trọng ngay cả khi lướt nhanh xuống danh sách.
const TONE = {
  regression: {
    borderL: 'border-l-rose-600',
    stamp: 'text-rose-700 dark:text-rose-400',
    label: 'Đang mất đơn',
    reason: 'text-rose-700 dark:text-rose-300',
    note: 'text-rose-600/80 dark:text-rose-400/70',
  },
  setup: {
    borderL: 'border-l-amber-500',
    stamp: 'text-amber-700 dark:text-amber-400',
    label: 'Chưa lên sóng',
    reason: 'text-amber-700 dark:text-amber-300',
    note: 'text-amber-600/80 dark:text-amber-400/70',
  },
}

export default function AttentionCard({ store: s, info }) {
  const biz = bizOf(s)
  const Icon = biz.icon
  const tone = TONE[info.severity] || TONE.setup
  return (
    <div className={'card flex flex-wrap items-start justify-between gap-4 border-l-4 p-5 ' + tone.borderL}>
      <Link
        to={`/stores/${s.id}`}
        className="group flex min-w-0 flex-1 items-start gap-3.5 rounded-lg focus-visible:outline-none"
      >
        <Icon size={18} className="mt-0.5 shrink-0 text-fg3" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-fg group-hover:underline">{s.name}</h3>
            <span className={'stamp ' + tone.stamp}>{tone.label}</span>
          </div>
          <p className="mt-1 text-sm text-fg/60">
            {biz.label} · {s.menu_count} món · {s.order_count} đơn
          </p>
          <p className={'mt-1.5 text-sm ' + tone.reason}>{info.reason}</p>
          {info.severity === 'regression' && info.lastOrderAt && (
            <p className={'mt-0.5 text-xs ' + tone.note}>
              Đơn gần nhất qua bot: {info.lastOrderAt} — số đơn trên là lịch sử trước khi mất kết nối, không phải đơn
              đang chờ xử lý.
            </p>
          )}
        </div>
      </Link>
      <Link
        to={`/stores/${s.id}?tab=channels`}
        className="btn-primary flex shrink-0 items-center gap-1.5 self-center px-3.5 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
      >
        Kết nối ngay
        <ArrowRight size={15} />
      </Link>
    </div>
  )
}
