import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useStoreOverview } from '../hooks/useStoreOverview'
import AttentionCard from '../components/AttentionCard'
import StoreRow from '../components/StoreRow'
import ErrorBanner from '../components/ErrorBanner'

export default function StoreListPage() {
  const { stores, error, load, attention, healthy } = useStoreOverview()

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Cửa hàng</h1>
          <p className="mt-1 text-sm text-fg/55">Quản lý bot đặt đơn cho tất cả cửa hàng.</p>
        </div>
        <Link
          to="/stores/new"
          className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
        >
          <Plus size={16} />
          Tạo cửa hàng
        </Link>
      </div>

      <ErrorBanner message={error} />

      {error && !stores && (
        <button onClick={load} className="btn-primary mb-6 px-4 py-2 text-sm">
          Thử lại
        </button>
      )}

      {stores && <p className="mb-7 text-sm text-fg2">{stores.length} cửa hàng</p>}

      {!stores ? (
        !error && <p className="text-fg/50">Đang tải…</p>
      ) : stores.length === 0 ? (
        <p className="text-fg/50">Chưa có cửa hàng nào.</p>
      ) : (
        <div className="space-y-8">
          {attention.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-fg">Cần xử lý ({attention.length})</h2>
              <div className="space-y-3">
                {attention.map(({ store: s, info }) => (
                  <AttentionCard key={s.id} store={s} info={info} />
                ))}
              </div>
            </section>
          )}

          {healthy.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-fg">
                {attention.length > 0 ? `Đang hoạt động tốt (${healthy.length})` : 'Tất cả cửa hàng'}
              </h2>
              <div className="card overflow-hidden">
                {healthy.map((s, i) => (
                  <StoreRow key={s.id} store={s} bordered={i > 0} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
