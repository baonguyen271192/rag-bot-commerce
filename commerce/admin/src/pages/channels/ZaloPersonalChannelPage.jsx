import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Info, QrCode, RefreshCw, ShieldAlert, Smartphone } from 'lucide-react'
import { api } from '../../lib/api'
import { rowsForChannel } from '../../lib/channels'
import ErrorBanner from '../../components/ErrorBanner'
import StatCard from '../../components/StatCard'
import ChannelStoreCell from '../../components/ChannelStoreCell'
import ChannelStatusPill from '../../components/ChannelStatusPill'
import ChannelPageHead from '../../components/ChannelPageHead'

// Trang tổng hợp kênh Zalo cá nhân — nguồn thiết kế: docs/channels-ia-mockup.html,
// phần "ZALO CÁ NHÂN". Chỉ liệt kê cửa hàng ĐÃ bật kênh (giống mockup) — bật/tắt kênh
// vẫn làm ở tab "Kênh" của từng cửa hàng (ChannelsTab.jsx), trang này không sửa gì.
export default function ZaloPersonalChannelPage() {
  const [stores, setStores] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.listStores().then(setStores).catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorBanner message={error} />
  if (!stores) return <p className="text-fg/50">Đang tải…</p>

  const allRows = rowsForChannel(stores, 'zalo_personal')
  const enabledRows = allRows.filter((r) => r.cfg.enabled)
  const running = enabledRows.filter((r) => r.cfg.connected)
  const needsRelogin = enabledRows.length - running.length
  // Xem ghi chú ở FacebookChannelPage: order_count là tổng đơn của CẢ cửa hàng, không
  // tách riêng theo kênh.
  const ordersOfRunning = running.reduce((sum, r) => sum + (r.store.order_count || 0), 0)

  return (
    <div>
      <ChannelPageHead
        icon={Smartphone}
        tint="bg-sky-500/15 text-sky-400"
        title="Zalo cá nhân"
        subtitle={
          <>
            Dùng tài khoản Zalo cá nhân qua bridge riêng. Đăng nhập (quét QR) &amp; phiên nằm ở service{' '}
            <code className="text-sky-700 dark:text-sky-300">zalo-bridge</code>, không lưu tại đây.
          </>
        }
        actions={
          <>
            <button
              type="button"
              disabled
              title="Chưa làm ở trang admin — xem QR trực tiếp ở endpoint của zalo-bridge (giống InfoNote trong tab Kênh của từng cửa hàng)."
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-fg/40"
            >
              <QrCode size={14} />
              Mở QR đăng nhập
            </button>
            <RestartBridgeButton />
          </>
        }
      />

      <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-sky-500/25 bg-sky-500/[0.08] px-4 py-3 text-sm text-sky-800 dark:text-sky-200/90">
        <Info size={16} className="mt-0.5 shrink-0" />
        <span>
          Sau khi bật kênh cho một cửa hàng ở tab "Kênh", cần khởi động lại bridge để nó nhận cửa hàng mới —{' '}
          <code className="text-sky-700 dark:text-sky-300">zalo-bridge</code> chỉ dò danh sách cửa hàng MỘT LẦN lúc
          chạy, không tự poll. Nút "Khởi động lại Bridge" ở trên hiện chỉ là khung — backend chưa có endpoint để
          thực hiện thật (xem TODO trong <code className="text-sky-700 dark:text-sky-300">src/lib/api.js</code>).
        </span>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={Smartphone}
          label="Phiên đang chạy"
          value={running.length}
          sub={`${enabledRows.length} cửa hàng đã bật kênh`}
          tone="sky"
        />
        <StatCard
          icon={RefreshCw}
          label="Đơn qua Zalo cá nhân"
          value={ordersOfRunning}
          sub="Tổng đơn của cửa hàng có phiên chạy — chưa lọc riêng theo kênh"
          tone="accent"
        />
        <StatCard
          icon={ShieldAlert}
          label="Cần đăng nhập lại"
          value={needsRelogin}
          sub="đã bật kênh nhưng chưa/hết phiên"
          tone="warning"
          highlight={needsRelogin > 0}
        />
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="text-sm font-semibold text-fg">Cửa hàng dùng Zalo cá nhân</h3>
          <span className="text-xs text-fg3">1 cửa hàng = 1 tài khoản Zalo</span>
        </div>
        {enabledRows.length === 0 ? (
          <div className="px-5 py-9 text-center text-sm text-fg3">
            Chưa cửa hàng nào bật Zalo cá nhân.{' '}
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
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide">Trạng thái phiên</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide">Tài khoản</th>
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
                      <ChannelStatusPill tone={cfg.connected ? 'on' : 'muted'}>
                        {cfg.connected ? 'Đã đăng nhập' : 'Đã bật · chờ QR'}
                      </ChannelStatusPill>
                    </td>
                    {/* Tên/số tài khoản Zalo thật nằm trên đĩa của sidecar zalo-bridge, commerce
                        không có field nào trả về nó qua /api/admin/stores — không bịa số, hiện
                        "—" cho tới khi có API thật (vd proxy /sessions của zalo-bridge). */}
                    <td className="px-5 py-3 font-mono text-xs text-fg/60">—</td>
                    <td className="px-5 py-3 text-right text-fg/90">{store.order_count}</td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        to={`/stores/${store.id}`}
                        className="inline-flex rounded-lg border border-line-strong px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-fg/[0.05]"
                      >
                        {cfg.connected ? 'Xem chi tiết' : 'Quét QR'}
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

// Nút "Khởi động lại Bridge" — gọi api.restartZaloBridge() (STUB, backend chưa có
// endpoint này — xem TODO trong lib/api.js). Bắt lỗi và hiện thông báo trung thực,
// KHÔNG giả vờ là đã restart thành công khi request thất bại.
function RestartBridgeButton() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null) // { ok: boolean, message: string } | null

  async function handleClick() {
    setBusy(true)
    setResult(null)
    try {
      await api.restartZaloBridge()
      setResult({ ok: true, message: 'Đã gửi yêu cầu khởi động lại bridge.' })
    } catch {
      setResult({
        ok: false,
        message:
          'Chưa thực hiện được — backend chưa có API để khởi động lại zalo-bridge. Cần SSH vào server và restart tiến trình thủ công (xem CLAUDE.md phần commerce/zalo-bridge).',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
      >
        <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
        {busy ? 'Đang gửi yêu cầu…' : 'Khởi động lại Bridge'}
      </button>
      {result && (
        <p
          role={result.ok ? 'status' : 'alert'}
          className={
            'mt-2 max-w-xs text-xs ' + (result.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')
          }
        >
          {result.message}
        </p>
      )}
    </div>
  )
}
