import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, ShoppingBag, Store, TriangleAlert } from 'lucide-react'
import { api } from '../lib/api'
import { IS_PORTAL } from '../lib/console'
import { useStoreOverview } from '../hooks/useStoreOverview'
import StatCard from '../components/StatCard'
import StoreTable from '../components/StoreTable'
import ChannelHealthStrip from '../components/ChannelHealthStrip'
import OrdersTrendChart from '../components/OrdersTrendChart'
import ErrorBanner from '../components/ErrorBanner'

export default function OverviewPage() {
  const { stores, error, load, totalOrders, attention, healthy } = useStoreOverview()

  // Gộp đơn hàng của mọi store đang có (1 store cho chủ cửa hàng, N cho super_admin)
  // để vẽ xu hướng theo ngày — KPI "Đơn qua bot" chỉ có tổng số, không có chiều thời
  // gian. Bỏ qua lỗi từng store lẻ (Promise.allSettled) để 1 store lỗi không chặn cả
  // biểu đồ của các store còn lại.
  const [orders, setOrders] = useState(null)
  useEffect(() => {
    if (!stores?.length) return
    Promise.allSettled(stores.map((s) => api.listOrders(s.id))).then((results) => {
      setOrders(results.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])))
    })
  }, [stores])

  // Cửa hàng nhiều đơn nhất — cho KPI "Đơn qua bot" 1 câu ngữ cảnh thực tế thay vì chỉ
  // 1 con số trần trụi (feedback đã lưu: KPI card cần sub-line từ dữ liệu thật, vd
  // "Nhiều nhất: X (5)"), không bịa thêm field nào, chỉ rút ra từ danh sách đã có.
  const busiest = stores?.length
    ? stores.reduce((a, b) => (b.order_count > a.order_count ? b : a))
    : null

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Tổng quan</h1>
        <p className="mt-1 text-sm text-fg/55">
          {IS_PORTAL ? 'Tình hình cửa hàng của bạn hôm nay.' : 'Sức khoẻ bot đặt đơn của tất cả cửa hàng.'}
        </p>
      </div>

      <ErrorBanner message={error} />

      {error && !stores && (
        <button onClick={load} className="btn-primary mb-6 px-4 py-2 text-sm">
          Thử lại
        </button>
      )}

      {stores && (
        <div className={'mb-5 grid gap-4 ' + (IS_PORTAL ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
          <StatCard
            icon={Store}
            label="Cửa hàng"
            value={stores.length}
            sub={
              IS_PORTAL
                ? healthy.length > 0 ? `${healthy.length} đang hoạt động tốt` : 'chưa có cửa hàng nào ổn định'
                : undefined
            }
            tone="info"
          />
          {/* Tín hiệu "cần xử lý" đọc TRỰC TIẾP từ trạng thái kết nối kênh (Facebook/Zalo)
              của từng cửa hàng — đúng loại dữ liệu VẬN HÀNH riêng của cửa hàng mà mô hình
              phân quyền đã chốt (BA/PO) nói admin không còn xem được nữa (giống nhóm nav
              "Kênh" đã gỡ khỏi AppShell.jsx). CHỈ còn hiện cho portal (đúng 1 cửa hàng của
              chính chủ shop). */}
          {IS_PORTAL && (
            <StatCard
              icon={TriangleAlert}
              label="Cần xử lý"
              value={attention.length}
              sub={attention.length > 0 ? 'chưa nhận được tin nhắn khách' : 'mọi thứ đều ổn'}
              tone={attention.length > 0 ? 'warning' : 'muted'}
              highlight={attention.length > 0}
            />
          )}
          <StatCard
            icon={ShoppingBag}
            label="Đơn qua bot"
            value={totalOrders}
            sub={
              IS_PORTAL
                ? totalOrders > 0 ? 'Tổng đơn từ trước đến nay' : 'chưa có đơn nào'
                : busiest && busiest.order_count > 0 ? `Nhiều nhất: ${busiest.name} (${busiest.order_count})` : 'chưa có đơn nào'
            }
            tone="accent"
          />
        </div>
      )}

      {stores && stores.length > 0 && orders && (
        <div className="mb-5">
          <OrdersTrendChart orders={orders} />
        </div>
      )}

      {IS_PORTAL && stores && stores.length > 0 && <ChannelHealthStrip stores={stores} />}

      {!stores ? (
        !error && <p className="text-fg/50">Đang tải…</p>
      ) : stores.length === 0 ? (
        <p className="text-fg/50">
          Chưa có cửa hàng nào.{' '}
          <Link to="/stores" className="inline-flex items-center gap-1 font-medium text-indigo-500 hover:underline">
            Tạo cửa hàng đầu tiên
            <ArrowRight size={14} />
          </Link>
        </p>
      ) : !IS_PORTAL ? null : attention.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h3 className="text-sm font-semibold text-fg">Cần xử lý ({attention.length})</h3>
            <Link to="/stores" className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-500 hover:underline">
              Xem chi tiết
              <ArrowRight size={13} />
            </Link>
          </div>
          <StoreTable stores={attention.map((a) => a.store)} />
        </div>
      ) : (
        <div className="card flex items-center gap-3.5 p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={18} />
          </span>
          <p className="text-sm text-fg2">Cửa hàng đang hoạt động tốt.</p>
        </div>
      )}
    </div>
  )
}
