import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { attentionInfo, CHANNEL_LABELS, CHANNEL_TYPES } from '../lib/channels'
import ChannelStoreCell from './ChannelStoreCell'
import ChannelStatusPill from './ChannelStatusPill'

// Mức ưu tiên hiển thị: mất đơn thật > chưa lên sóng > đang ổn (info null). Viết
// RIÊNG ở đây (không dùng lib/channels.js's sortAttention()) vì hàm đó giả định mọi
// phần tử đều có info non-null (chỉ dùng cho danh sách ĐÃ lọc "cần xử lý") — StoreTable
// nhận cả cửa hàng khoẻ mạnh (info === null), gọi sortAttention() thẳng sẽ crash khi so
// sánh 2 phần tử có info null (`null.severity`).
const SEVERITY_RANK = { regression: 0, setup: 1 }
function severityRank(info) {
  return info ? SEVERITY_RANK[info.severity] ?? 1 : 2
}

// Bảng dữ liệu DUY NHẤT cho danh sách cửa hàng — dùng chung cho Tổng quan (rút gọn,
// chỉ cửa hàng cần xử lý) và trang Cửa hàng (đầy đủ + ô tìm kiếm). Thay cho kiểu
// card tường thuật (AttentionCard) lặp lại cho từng cửa hàng — 1 bảng, cột "Trạng
// thái" tự nói lên mức độ nghiêm trọng, sắp xếp sẵn mất-đơn > chưa-lên-sóng > ổn,
// khớp cách trình bày đã dùng ở 3 trang Kênh (StatCard + table + ChannelStatusPill).
export default function StoreTable({ stores, limit }) {
  const rows = stores
    .map((s) => ({ store: s, info: attentionInfo(s) }))
    .sort((a, b) => severityRank(a.info) - severityRank(b.info))
  const shown = limit ? rows.slice(0, limit) : rows

  if (shown.length === 0) {
    return <p className="px-5 py-9 text-center text-sm text-fg3">Không có cửa hàng nào khớp.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-surface text-left text-fg/40">
          <tr>
            <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide">Cửa hàng</th>
            <th className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wide">Trạng thái</th>
            <th className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wide">Kênh</th>
            <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide">Món</th>
            <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide">Đơn</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-fg/[0.05]">
          {shown.map(({ store: s, info }) => (
            <tr key={s.id} className="transition-colors hover:bg-fg/[0.02]">
              <td className="px-5 py-3">
                <Link to={`/stores/${s.id}/config`} className="block w-fit rounded hover:underline focus-visible:outline-none">
                  <ChannelStoreCell store={s} />
                </Link>
              </td>
              <td className="px-5 py-3 text-center">
                <StatusPill info={info} />
              </td>
              <td className="px-5 py-3">
                <ChannelDots channels={s.channels} />
              </td>
              <td className="px-5 py-3 text-right tabular-nums text-fg/80">{s.menu_count}</td>
              <td className="px-5 py-3 text-right tabular-nums text-fg/90">{s.order_count}</td>
              <td className="px-5 py-3 text-right">
                {info ? (
                  <Link
                    to={`/stores/${s.id}/channels`}
                    className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                  >
                    Kết nối ngay
                    <ArrowRight size={13} />
                  </Link>
                ) : (
                  <Link
                    to={`/stores/${s.id}/config`}
                    className="inline-flex rounded-lg border border-line-strong px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-fg/[0.05]"
                  >
                    Xem
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatusPill({ info }) {
  if (!info) return <ChannelStatusPill tone="on">Hoạt động tốt</ChannelStatusPill>
  if (info.severity === 'regression') return <ChannelStatusPill tone="critical">Đang mất đơn</ChannelStatusPill>
  return <ChannelStatusPill tone="off">Chưa lên sóng</ChannelStatusPill>
}

// 3 chấm kênh (Facebook/Zalo cá nhân/Zalo OA) — xanh = đã kết nối thật, xám = chưa.
// Gọn hơn 3 pill chữ đầy đủ (đã có ở từng trang Kênh riêng) vì ở đây chỉ cần liếc
// nhanh biết cửa hàng sống nhờ kênh nào, không cần chi tiết Page ID/token.
function ChannelDots({ channels }) {
  const ch = channels || {}
  return (
    <div className="flex items-center justify-center gap-1.5">
      {CHANNEL_TYPES.map((t) => (
        <span
          key={t}
          title={`${CHANNEL_LABELS[t]}: ${ch[t]?.connected ? 'đã kết nối' : 'chưa kết nối'}`}
          className={
            'h-2.5 w-2.5 rounded-full ' + (ch[t]?.connected ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-fg/15')
          }
        />
      ))}
    </div>
  )
}
