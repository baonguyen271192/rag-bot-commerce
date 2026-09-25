import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { useStoreOverview } from '../hooks/useStoreOverview'
import AttentionCard from '../components/AttentionCard'
import ErrorBanner from '../components/ErrorBanner'

export default function OverviewPage() {
  const { stores, error, load, totalOrders, attention, healthy } = useStoreOverview()

  return (
    <div>
      <div className="mb-2">
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
        <div className="card mb-7 flex divide-x divide-line overflow-hidden">
          <KpiStub value={stores.length} label="cửa hàng" />
          {attention.length > 0 && (
            <KpiStub value={attention.length} label="cần xử lý" className="text-amber-600 dark:text-amber-400" />
          )}
          <KpiStub value={totalOrders} label="đơn qua bot" />
        </div>
      )}

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
        <section>
          <h2 className="mb-3 text-sm font-semibold text-fg">Cần xử lý ({attention.length})</h2>
          <div className="space-y-3">
            {attention.map(({ store: s, info }) => (
              <AttentionCard key={s.id} store={s} info={info} />
            ))}
          </div>
        </section>
      ) : (
        <div className="card flex items-center gap-3.5 p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={18} />
          </span>
          <p className="text-sm text-fg2">Tất cả {healthy.length} cửa hàng đều đang hoạt động tốt.</p>
        </div>
      )}

      {stores && stores.length > 0 && (
        <div className="mt-8 flex items-center gap-3 text-sm">
          {attention.length > 0 && healthy.length > 0 && (
            <span className="text-fg/55">
              {healthy.length} cửa hàng khác đang hoạt động tốt.
            </span>
          )}
          <Link to="/stores" className="inline-flex items-center gap-1.5 font-medium text-indigo-500 hover:underline">
            Xem tất cả cửa hàng
            <ArrowRight size={15} />
          </Link>
        </div>
      )}
    </div>
  )
}

// Dải số liệu kiểu "cuống vé" — số lớn + nhãn nhỏ, ngăn bằng gạch dọc thay vì dấu "·"
// giữa các con số trong 1 câu văn.
function KpiStub({ value, label, className }) {
  return (
    <div className="flex-1 px-5 py-4">
      <div className={'text-2xl font-semibold tabular-nums tracking-tight ' + (className || 'text-fg')}>{value}</div>
      <div className="mt-0.5 text-xs text-fg/55">{label}</div>
    </div>
  )
}
