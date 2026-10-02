import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { useStoreOverview } from '../hooks/useStoreOverview'
import { useAuth } from '../lib/auth'
import StoreTable from '../components/StoreTable'
import ErrorBanner from '../components/ErrorBanner'

export default function StoreListPage() {
  const { stores, error, load, attention } = useStoreOverview()
  const { user } = useAuth()
  const [query, setQuery] = useState('')

  // Chủ cửa hàng chỉ có đúng 1 store (xem stores.provision_tenant_store) — danh sách
  // 1 dòng rồi bắt click thêm lần nữa vào đúng dòng đó là thừa thao tác, nên vào thẳng
  // trang chi tiết. Chỉ super_admin mới thực sự cần xem danh sách nhiều cửa hàng.
  if (user?.role !== 'super_admin' && stores?.length === 1) {
    return <Navigate to={`/stores/${stores[0].id}/config`} replace />
  }

  const filtered = useMemo(() => {
    if (!stores) return null
    const q = query.trim().toLowerCase()
    if (!q) return stores
    return stores.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.owner_email || '').toLowerCase().includes(q),
    )
  }, [stores, query])

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Cửa hàng</h1>
          <p className="mt-1 text-sm text-fg/55">
            {user?.role === 'super_admin'
              ? 'Quản lý bot đặt đơn cho tất cả cửa hàng.'
              : 'Quản lý bot đặt đơn cho cửa hàng của bạn.'}
          </p>
        </div>
        {user?.role === 'super_admin' && (
          <Link
            to="/stores/new"
            className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
          >
            <Plus size={16} />
            Tạo cửa hàng
          </Link>
        )}
      </div>

      <ErrorBanner message={error} />

      {error && !stores && (
        <button onClick={load} className="btn-primary mb-6 px-4 py-2 text-sm">
          Thử lại
        </button>
      )}

      {!stores ? (
        !error && <p className="text-fg/50">Đang tải…</p>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <h3 className="text-sm font-semibold text-fg">
              {stores.length} cửa hàng
              {attention.length > 0 && <span className="ml-2 font-normal text-amber-600 dark:text-amber-400">· {attention.length} cần xử lý</span>}
            </h3>
            <label className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg/35" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm theo tên hoặc email chủ cửa hàng…"
                className="input w-56 py-1.5 pl-8 text-sm"
              />
            </label>
          </div>
          <StoreTable stores={filtered} />
        </div>
      )}
    </div>
  )
}
