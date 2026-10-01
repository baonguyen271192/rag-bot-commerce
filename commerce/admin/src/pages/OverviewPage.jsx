import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, ShoppingBag, Store, TriangleAlert } from 'lucide-react'
import { useStoreOverview } from '../hooks/useStoreOverview'
import StatCard from '../components/StatCard'
import StoreTable from '../components/StoreTable'
import ChannelHealthStrip from '../components/ChannelHealthStrip'
import ErrorBanner from '../components/ErrorBanner'

export default function OverviewPage() {
  const { stores, error, load, totalOrders, attention, healthy } = useStoreOverview()

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
        <p className="mt-1 text-sm text-fg/55">Sức khoẻ bot đặt đơn của tất cả cửa hàng.</p>
      </div>

      <ErrorBanner message={error} />

      {error && !stores && (
        <button onClick={load} className="btn-primary mb-6 px-4 py-2 text-sm">
          Thử lại
        </button>
      )}

      {stores && (
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <StatCard
            icon={Store}
            label="Cửa hàng"
            value={stores.length}
            sub={healthy.length > 0 ? `${healthy.length} đang hoạt động tốt` : 'chưa có cửa hàng nào ổn định'}
            tone="info"
          />
          <StatCard
            icon={TriangleAlert}
            label="Cần xử lý"
            value={attention.length}
            sub={attention.length > 0 ? 'chưa nhận được tin nhắn khách' : 'tất cả cửa hàng đều ổn'}
            tone={attention.length > 0 ? 'warning' : 'muted'}
            highlight={attention.length > 0}
          />
          <StatCard
            icon={ShoppingBag}
            label="Đơn qua bot"
            value={totalOrders}
            sub={busiest && busiest.order_count > 0 ? `Nhiều nhất: ${busiest.name} (${busiest.order_count})` : 'chưa có đơn nào'}
            tone="accent"
          />
        </div>
      )}

      {stores && stores.length > 0 && <ChannelHealthStrip stores={stores} />}

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
      ) : attention.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h3 className="text-sm font-semibold text-fg">Cần xử lý ({attention.length})</h3>
            <Link to="/stores" className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-500 hover:underline">
              Xem tất cả cửa hàng
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
          <p className="text-sm text-fg2">Tất cả {healthy.length} cửa hàng đều đang hoạt động tốt.</p>
        </div>
      )}
    </div>
  )
}
