import { useMemo, useState } from 'react'

const DAYS = 14
const W = 640
const H = 180
const PAD = { l: 8, r: 8, t: 16, b: 22 }
const PLOT_W = W - PAD.l - PAD.r
const PLOT_H = H - PAD.t - PAD.b

// Khoá theo chuỗi "dd/mm/yyyy" (10 ký tự đầu của order.created_at, vốn đã là giờ VN
// — xem data.now_vn() ở backend) THAY VÌ parse thành Date rồi lấy lại ngày theo múi
// giờ trình duyệt — tránh lệch ngày nếu máy xem không ở múi giờ VN.
function lastNDayKeys(n) {
  const keys = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    keys.push(`${dd}/${mm}/${d.getFullYear()}`)
  }
  return keys
}

// Đơn hàng theo ngày, 14 ngày gần nhất — line + area 1 series, không cần legend
// (xem dataviz: "single series needs no legend box"). Nhãn hiện trực tiếp ở điểm
// cuối (không chỉ qua hover) vì màu accent chỉ đạt ~2.7:1 trên nền sáng — dưới
// ngưỡng 3:1, cần "relief": nhãn luôn hiện + tooltip, không chỉ dựa vào màu.
export default function OrdersTrendChart({ orders }) {
  const points = useMemo(() => {
    const keys = lastNDayKeys(DAYS)
    const counts = Object.fromEntries(keys.map((k) => [k, 0]))
    for (const o of orders) {
      const day = (o.created_at || '').slice(0, 10)
      if (day in counts) counts[day] += 1
    }
    return keys.map((k) => ({ day: k, count: counts[k] }))
  }, [orders])

  const [hoverIdx, setHoverIdx] = useState(null)

  const max = Math.max(1, ...points.map((p) => p.count))
  const stepX = PLOT_W / (points.length - 1)
  const x = (i) => PAD.l + i * stepX
  const y = (v) => PAD.t + PLOT_H - (v / max) * PLOT_H

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.count).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${x(points.length - 1).toFixed(1)} ${PAD.t + PLOT_H} L ${x(0).toFixed(1)} ${PAD.t + PLOT_H} Z`

  const last = points[points.length - 1]
  const totalInRange = points.reduce((s, p) => s + p.count, 0)
  const tickEvery = Math.ceil(points.length / 5)
  const hovered = hoverIdx != null ? points[hoverIdx] : null

  function handlePointer(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    setHoverIdx(Math.max(0, Math.min(points.length - 1, Math.round((px - PAD.l) / stepX))))
  }

  // Bàn phím: cùng 1 tooltip như hover chuột (interaction.md — "same details on
  // keyboard focus as on hover"), mũi tên trái/phải dò từng điểm.
  function handleKeyDown(e) {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      setHoverIdx((i) => Math.min(points.length - 1, (i ?? points.length - 1) + 1))
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setHoverIdx((i) => Math.max(0, (i ?? points.length - 1) - 1))
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-fg">Đơn hàng {DAYS} ngày gần đây</h3>
        <span className="text-xs text-fg3">{totalInRange} đơn</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
        role="img"
        tabIndex={0}
        aria-label={`Biểu đồ số đơn hàng mỗi ngày trong ${DAYS} ngày gần đây, tổng ${totalInRange} đơn, gần nhất ${last.count} đơn hôm nay. Dùng phím mũi tên trái phải để xem từng ngày.`}
        onMouseMove={handlePointer}
        onMouseLeave={() => setHoverIdx(null)}
        onFocus={() => setHoverIdx((i) => i ?? points.length - 1)}
        onBlur={() => setHoverIdx(null)}
        onKeyDown={handleKeyDown}
      >
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={PAD.l}
            x2={W - PAD.r}
            y1={PAD.t + PLOT_H * (1 - f)}
            y2={PAD.t + PLOT_H * (1 - f)}
            className="stroke-line"
            strokeWidth="1"
          />
        ))}

        <path d={areaPath} className="fill-indigo-600/10" stroke="none" />
        <path d={linePath} fill="none" className="stroke-indigo-600" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        <circle cx={x(points.length - 1)} cy={y(last.count)} r="4" className="fill-indigo-600 stroke-surface" strokeWidth="2" />
        <text x={x(points.length - 1)} y={y(last.count) - 10} textAnchor="end" className="fill-fg text-[11px] font-semibold">
          {last.count}
        </text>

        {hovered && (
          <>
            <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={PAD.t} y2={PAD.t + PLOT_H} className="stroke-fg3" strokeWidth="1" strokeDasharray="2,2" />
            <circle cx={x(hoverIdx)} cy={y(hovered.count)} r="4" className="fill-indigo-600 stroke-surface" strokeWidth="2" />
          </>
        )}

        {points.map((p, i) =>
          i % tickEvery === 0 ? (
            <text key={p.day} x={x(i)} y={H - 4} textAnchor="middle" className="fill-fg3 text-[10px]">
              {p.day.slice(0, 5)}
            </text>
          ) : null,
        )}
      </svg>
      <div className="mt-1 h-4 text-xs text-fg2">
        {hovered && (
          <>
            <span className="font-semibold text-fg">{hovered.count} đơn</span> · {hovered.day}
          </>
        )}
      </div>
    </div>
  )
}
