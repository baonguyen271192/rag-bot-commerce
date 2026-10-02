import { useEffect, useMemo, useState } from 'react'
import { Search, Users } from 'lucide-react'
import { api } from '../lib/api'
import ErrorBanner from './ErrorBanner'
import EmptyState from './EmptyState'

export default function CustomersTab({ storeId }) {
  const [customers, setCustomers] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    api.listCustomers(storeId).then(setCustomers).catch((e) => setError(e.message))
  }, [storeId])

  const filtered = useMemo(() => {
    if (!customers) return null
    const q = query.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q),
    )
  }, [customers, query])

  if (error) return <ErrorBanner message={error} />
  if (!customers) return <p className="text-fg/50">Đang tải…</p>
  if (customers.length === 0) return <EmptyState icon={Users} text="Chưa có khách hàng nào đặt đơn qua bot." />

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h3 className="text-sm font-semibold text-fg">{customers.length} khách hàng</h3>
        <label className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo tên/SĐT…"
            className="input w-56 py-1.5 pl-8 text-sm"
          />
        </label>
      </div>
      <div className="scrollbar-thin max-h-[560px] overflow-x-auto overflow-y-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 bg-surface text-left text-fg/40">
            <tr>
              <th className="px-5 py-3 font-medium">Khách hàng</th>
              <th className="px-5 py-3 font-medium">SĐT</th>
              <th className="px-5 py-3 text-right font-medium">Điểm</th>
              <th className="px-5 py-3 text-right font-medium">Số đơn</th>
              <th className="px-5 py-3 text-right font-medium">Tổng chi tiêu</th>
              <th className="px-5 py-3 font-medium">Mua gần nhất</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-fg/[0.05]">
            {filtered.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-fg/[0.02]">
                <td className="px-5 py-3 text-fg/90">{c.name || '—'}</td>
                <td className="px-5 py-3 text-fg/50">{c.phone}</td>
                <td className="px-5 py-3 text-right font-medium text-fg/90">{c.points_balance}</td>
                <td className="px-5 py-3 text-right text-fg/50">{c.order_count}</td>
                <td className="px-5 py-3 text-right text-fg/90">{Number(c.total_spent).toLocaleString('vi-VN')}đ</td>
                <td className="px-5 py-3 text-fg/40">{c.last_order_at || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
