// Pill trạng thái nhỏ trong bảng của 3 trang kênh — khớp .pill.on/.off/.muted của
// docs/channels-ia-mockup.html.
const TONE = {
  on: { cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500 dark:bg-emerald-400' },
  off: { cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-400', dot: 'bg-amber-500 dark:bg-amber-400' },
  // 'critical' — nghiêm trọng hơn 'off' (vd cửa hàng ĐÃ TỪNG có đơn, giờ mất hết kênh
  // sống — đang mất đơn thật mỗi ngày, không chỉ "chưa lên sóng").
  critical: { cls: 'bg-rose-500/10 text-rose-700 dark:text-rose-400', dot: 'bg-rose-500 dark:bg-rose-400' },
  muted: { cls: 'bg-fg/[0.06] text-fg3', dot: 'bg-fg3' },
}

export default function ChannelStatusPill({ tone, children }) {
  const t = TONE[tone] || TONE.muted
  return (
    <span className={'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ' + t.cls}>
      <span className={'h-1.5 w-1.5 rounded-full ' + t.dot} />
      {children}
    </span>
  )
}
