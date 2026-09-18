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
export function attentionInfo(store) {
  const channels = store.channels || {}
  const connected = CHANNEL_TYPES.filter((t) => channels[t]?.connected)
  if (connected.length > 0) return null // có ít nhất 1 kênh sống -> không cần xử lý

  const brokenEnabled = CHANNEL_TYPES.filter((t) => channels[t]?.enabled && !channels[t]?.connected)
  const reason = brokenEnabled.length
    ? `Đã bật ${brokenEnabled.map((t) => CHANNEL_LABELS[t]).join(', ')} nhưng chưa kết nối được.`
    : 'Chưa bật kênh nào — bot chưa thể nhận tin nhắn từ khách.'
  return { reason }
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
