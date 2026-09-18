import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Send, TriangleAlert } from 'lucide-react'
import { api } from '../../lib/api'
import { maskId, rowsForChannel } from '../../lib/channels'
import ErrorBanner from '../../components/ErrorBanner'
import StatCard from '../../components/StatCard'
import ChannelStoreCell from '../../components/ChannelStoreCell'
import ChannelStatusPill from '../../components/ChannelStatusPill'
import ChannelPageHead from '../../components/ChannelPageHead'

// Trang tổng hợp kênh Facebook — liệt kê MỌI cửa hàng, không sửa cấu hình ở đây
// (cấu hình chi tiết vẫn ở tab "Kênh" của từng cửa hàng, xem ChannelsTab.jsx).
// Nguồn thiết kế: docs/channels-ia-mockup.html, phần "KÊNH FACEBOOK".
export default function FacebookChannelPage() {
  const [stores, setStores] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.listStores().then(setStores).catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorBanner message={error} />
  if (!stores) return <p className="text-fg/50">Đang tải…</p>

  const rows = rowsForChannel(stores, 'facebook')
  const connected = rows.filter((r) => r.cfg.connected)
  const notConnected = rows.length - connected.length
  // order_count là TỔNG đơn của cả cửa hàng (mọi kênh) — backend chưa lọc theo cột
  // `channel` riêng cho từng kênh, nên số dưới đây là "tổng đơn của các cửa hàng đang
  // bật Facebook", KHÔNG PHẢI "đơn đến từ đúng Facebook". Ghi rõ ở sub của KPI.
  const ordersOfConnected = connected.reduce((sum, r) => sum + (r.store.order_count || 0), 0)

  return (
    <div>
      <ChannelPageHead
        icon={Send}
        tint="bg-blue-500/15 text-blue-400"
        title="Kênh Facebook"
        subtitle="Tổng hợp trạng thái kết nối Fanpage của mọi cửa hàng. Nhấn “Cấu hình” để chỉnh Page ID / token trong từng cửa hàng."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={CheckCircle2}
          label="Đã kết nối"
          value={connected.length}
          sub={`trên ${rows.length} cửa hàng`}
          accent="bg-emerald-500/15 text-emerald-400"
        />
        <StatCard
          icon={TriangleAlert}
          label="Chưa kết nối"
          value={notConnected}
          sub="cần điền Page ID / token"
          accent="bg-amber-500/15 text-amber-400"
        />
        <StatCard
          icon={Send}
          label="Tổng đơn (cửa hàng đang bật kênh)"
          value={ordersOfConnected}
          sub="Chưa lọc riêng theo kênh — xem ghi chú dưới bảng"
          accent="bg-violet-500/15 text-violet-400"
        />
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="text-sm font-semibold text-fg">{rows.length} cửa hàng</h3>
          <span className="text-xs text-fg3">Token che, chỉ hiện đã/chưa có</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface text-left text-fg/40">
              <tr>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide">Cửa hàng</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide">Trạng thái</th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide">Page ID</th>
                <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide">Đơn</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-fg/[0.05]">
              {rows.map(({ store, cfg }) => (
                <tr key={store.id} className="transition-colors hover:bg-fg/[0.02]">
                  <td className="px-5 py-3">
                    <ChannelStoreCell store={store} />
                  </td>
                  <td className="px-5 py-3">
                    <ChannelStatusPill tone={cfg.connected ? 'on' : 'off'}>
                      {cfg.connected ? 'Đã kết nối' : 'Chưa kết nối'}
                    </ChannelStatusPill>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-fg/60">{maskId(cfg.page_id)}</td>
                  <td className="px-5 py-3 text-right text-fg/90">{store.order_count}</td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      to={`/stores/${store.id}`}
                      className={
                        'inline-flex rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ' +
                        (cfg.connected
                          ? 'border-line-strong text-fg hover:bg-fg/[0.05]'
                          : 'border-transparent bg-indigo-500 text-white hover:brightness-110')
                      }
                    >
                      {cfg.connected ? 'Cấu hình' : 'Kết nối'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

