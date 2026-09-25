// Derive dữ liệu cho 3 trang kênh tổng hợp (Facebook / Zalo cá nhân / Zalo OA) từ
// GET /api/admin/stores — KHÔNG cần thêm API mới, mỗi store summary đã có
// channels.{facebook,zalo_personal,zalo_oa} + order_count (order_count là TỔNG mọi
// kênh của store, backend chưa lọc theo channel — xem ghi chú ở từng trang kênh).
export const CHANNEL_TYPES = ['facebook', 'zalo_personal', 'zalo_oa']

export const CHANNEL_LABELS = {
  facebook: 'Facebook',
  zalo_personal: 'Zalo cá nhân',
  zalo_oa: 'Zalo OA',
}

// Cửa hàng "cần xử lý" = không có kênh nào đang thật sự nhận được tin nhắn — dù đã
// bật/chưa bật kênh nào cũng không quan trọng bằng việc bot có nhận được gì hay không.
// Nếu có kênh đã bật mà chưa kết nối (thiếu token/QR), nêu đích danh kênh đó; nếu chưa
// bật kênh nào cả, nói thẳng "chưa bật kênh nào" — không đổ lỗi cho Facebook oan.
//
// `severity` tách 2 tình huống khác bản chất, dựa trên order_count (đã từng nhận đơn
// qua bot hay chưa) chứ không dựa vào "đã bật kênh nào" — vì 1 cửa hàng có thể có lịch
// sử đơn từ TRƯỚC rồi bị tắt hết kênh sau đó, đó vẫn là "đang mất đơn mới", không phải
// "chưa từng dùng":
//   - 'regression' = đã từng có đơn qua bot, giờ không kênh nào sống -> đang mất đơn
//     THẬT mỗi ngày, ưu tiên xử lý trước.
//   - 'setup'      = chưa từng có đơn -> chưa lên sóng, chưa mất gì, ưu tiên thấp hơn.
export function attentionInfo(store) {
  const channels = store.channels || {}
  const connected = CHANNEL_TYPES.filter((t) => channels[t]?.connected)
  if (connected.length > 0) return null // có ít nhất 1 kênh sống -> không cần xử lý

  const brokenEnabled = CHANNEL_TYPES.filter((t) => channels[t]?.enabled && !channels[t]?.connected)
  const reason = brokenEnabled.length
    ? `Đã bật ${brokenEnabled.map((t) => CHANNEL_LABELS[t]).join(', ')} nhưng chưa kết nối được.`
    : 'Chưa bật kênh nào — bot chưa thể nhận tin nhắn từ khách.'
  const severity = store.order_count > 0 ? 'regression' : 'setup'
  return { reason, severity, lastOrderAt: store.last_order_at || null }
}

// regression lên trước setup trong danh sách "cần xử lý" — mất đơn thật khẩn cấp hơn
// chưa lên sóng.
export function sortAttention(attention) {
  return [...attention].sort((a, b) =>
    a.info.severity === b.info.severity ? 0 : a.info.severity === 'regression' ? -1 : 1
  )
}

// Với mỗi cửa hàng, gắn thêm cfg + trạng thái của đúng 1 loại kênh (ctype) để trang
// kênh chỉ cần map qua danh sách này mà không phải lặp lại logic `channels?.[ctype]`.
export function rowsForChannel(stores, ctype) {
  return (stores || []).map((s) => ({ store: s, cfg: s.channels?.[ctype] || {} }))
}

export function channelCounts(stores, ctype) {
  const rows = rowsForChannel(stores, ctype)
  const active = rows.filter((r) => r.cfg.enabled).length
  return { active, total: rows.length }
}

// Màu badge sidebar/KPI theo tỉ lệ active/total — tự quyết (kế hoạch chỉ mô tả 2 trong
// 3 trường hợp qua mockup: "amber nếu còn cửa hàng chưa bật, xám nếu 0"):
//   - 0 cửa hàng bật (hoặc 0 cửa hàng tồn tại)  -> muted (xám, "chưa dùng tới")
//   - bật hết 100%                              -> emerald (xanh, "đã xong")
//   - bật một phần                              -> amber (còn cửa hàng chưa bật)
export function badgeTone(active, total) {
  if (total === 0 || active === 0) return 'muted'
  if (active === total) return 'emerald'
  return 'amber'
}

export const BADGE_TONE_CLASS = {
  muted: 'bg-fg/[0.08] text-fg3',
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  emerald: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
}

// Che id/token cho gọn trong bảng — không phải mã hoá, chỉ hiện vài ký tự đầu/cuối.
export function maskId(value, keepStart = 6, keepEnd = 2) {
  if (!value) return '—'
  const s = String(value)
  if (s.length <= keepStart + keepEnd) return s
  return `${s.slice(0, keepStart)}••••${s.slice(-keepEnd)}`
}
