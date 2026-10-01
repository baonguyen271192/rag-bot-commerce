// Vạch màu trái (motif "con dấu/cuống vé" đã dùng cho AttentionCard/StoreTable trước
// đây) THAY cho icon-chip-trong-hộp đơn thuần — phân biệt rõ ý nghĩa từng số liệu ngay
// cả khi liếc nhanh, tránh cảm giác "3 card giống hệt nhau" của khuôn mẫu SaaS chung
// chung. `highlight` tô nền nhạt theo tone khi số liệu đang ở trạng thái CẦN CHÚ Ý
// (vd "Cần xử lý" > 0) — chỉ dùng cho thẻ đóng vai cảnh báo, không áp cho số liệu trung tính.
const TONE = {
  info: { icon: 'bg-indigo-500/15 text-indigo-400', bar: 'bg-indigo-500', tint: 'bg-indigo-500/[0.05]' },
  warning: { icon: 'bg-amber-500/15 text-amber-500', bar: 'bg-amber-500', tint: 'bg-amber-500/[0.07]' },
  critical: { icon: 'bg-rose-500/15 text-rose-500', bar: 'bg-rose-500', tint: 'bg-rose-500/[0.07]' },
  success: { icon: 'bg-emerald-500/15 text-emerald-500', bar: 'bg-emerald-500', tint: 'bg-emerald-500/[0.05]' },
  muted: { icon: 'bg-fg/[0.06] text-fg/40', bar: 'bg-fg/15', tint: '' },
  accent: { icon: 'bg-violet-500/15 text-violet-400', bar: 'bg-violet-500', tint: 'bg-violet-500/[0.05]' },
  // blue/sky — màu THƯƠNG HIỆU kênh (Facebook/Zalo cá nhân), không mang nghĩa trạng
  // thái như các tone trên, giữ nguyên để khớp ChannelsTab.jsx.
  blue: { icon: 'bg-blue-500/15 text-blue-400', bar: 'bg-blue-500', tint: 'bg-blue-500/[0.05]' },
  sky: { icon: 'bg-sky-500/15 text-sky-400', bar: 'bg-sky-500', tint: 'bg-sky-500/[0.05]' },
}

export default function StatCard({ icon: Icon, label, value, sub, tone = 'info', highlight = false }) {
  const t = TONE[tone] || TONE.info
  return (
    <div className={'card relative flex items-center gap-4 overflow-hidden p-5 pl-6 ' + (highlight ? t.tint : '')}>
      <span className={'absolute inset-y-0 left-0 w-1 ' + t.bar} />
      <span className={'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ' + t.icon}>
        <Icon size={22} />
      </span>
      <div className="min-w-0">
        <div className="text-3xl font-semibold tracking-tight text-fg">{value}</div>
        <div className="text-sm font-medium text-fg/60">{label}</div>
        {sub && <div className="mt-0.5 truncate text-xs text-fg/55">{sub}</div>}
      </div>
    </div>
  )
}
