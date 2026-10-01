import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layers, MessageCircle, ShieldAlert, TriangleAlert } from 'lucide-react'
import { api } from '../../lib/api'
import { maskId, rowsForChannel } from '../../lib/channels'
import ErrorBanner from '../../components/ErrorBanner'
import StatCard from '../../components/StatCard'
import ChannelStoreCell from '../../components/ChannelStoreCell'
import ChannelStatusPill from '../../components/ChannelStatusPill'
import ChannelPageHead from '../../components/ChannelPageHead'

// Trang tổng hợp kênh Zalo OA — nguồn thiết kế: docs/channels-ia-mockup.html, phần
// "ZALO OA". Backend Zalo OA hiện chỉ là khung (chưa có tài liệu API chính thức —
// [Chưa xác minh], xem CLAUDE.md phần commerce/app/main.py::_channel_public), nên
// trang này gắn nhãn Beta + banner "Chưa xác minh" giống mockup, KHÔNG bịa số liệu.
export default function ZaloOaChannelPage() {
  const [stores, setStores] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.listStores().then(setStores).catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorBanner message={error} />
  if (!stores) return <p className="text-fg/50">Đang tải…</p>

  const allRows = rowsForChannel(stores, 'zalo_oa')
  const enabledRows = allRows.filter((r) => r.cfg.enabled)
  const connected = enabledRows.filter((r) => r.cfg.connected)

  return (
    <div>
      <ChannelPageHead
        icon={MessageCircle}
        tint="bg-amber-500/15 text-amber-400"
        title="Zalo OA"
        badge={
          <span className="rounded-full border border-amber-500/30 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
            Beta
          </span>
        }
        subtitle="Kênh Official Account chính thức của Zalo. Đang chờ tài liệu API — phần này là khung, chưa gửi/nhận tin thật."
      />

      <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-amber-500/28 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
        <TriangleAlert size={16} className="mt-0.5 shrink-0" />
        <span>
          <strong className="font-semibold text-fg">Chưa xác minh:</strong> tên trường, webhook và cơ chế token là
          tạm đặt, chưa khớp API Zalo OA thật. Webhook hiện chỉ định tuyến rồi bỏ qua. Đừng dùng ở production tới
          khi có tài liệu chính thức.
        </span>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={ShieldAlert}
          label="OA đã kết nối"
          value={connected.length}
          sub="chờ tài liệu API"
          tone="warning"
        />
        <StatCard icon={MessageCircle} label="Đơn qua OA" value="—" sub="chưa khả dụng" tone="muted" />
        <StatCard
          icon={Layers}
          label="Trường cấu hình"
          value={4}
          sub="OA ID · App Secret · Access/Refresh token"
          tone="accent"
        />
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="text-sm font-semibold text-fg">Cửa hàng dùng Zalo OA</h3>
          <span className="text-xs text-fg3">Khung — bật để lưu cấu hình trước</span>
        </div>
        {enabledRows.length === 0 ? (
          <div className="px-5 py-9 text-center text-sm text-fg3">
            Chưa cửa hàng nào bật Zalo OA.{' '}
            <Link to="/" className="font-medium text-indigo-600 dark:text-indigo-300">
              Chọn cửa hàng để bật
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-surface text-left text-fg/40">
                <tr>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide">Cửa hàng</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide">Trạng thái</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide">OA ID</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide">Đơn</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-fg/[0.05]">
                {enabledRows.map(({ store, cfg }) => (
                  <tr key={store.id} className="transition-colors hover:bg-fg/[0.02]">
                    <td className="px-5 py-3">
                      <ChannelStoreCell store={store} />
                    </td>
                    <td className="px-5 py-3">
                      <ChannelStatusPill tone={cfg.connected ? 'on' : 'off'}>
                        {cfg.connected ? 'Đã kết nối' : 'Chưa kết nối'}
                      </ChannelStatusPill>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-fg/60">{maskId(cfg.oa_id)}</td>
                    <td className="px-5 py-3 text-right text-fg/90">{store.order_count}</td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        to={`/stores/${store.id}`}
                        className="inline-flex rounded-lg border border-line-strong px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-fg/[0.05]"
                      >
                        Cấu hình
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
