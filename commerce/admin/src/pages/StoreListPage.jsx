import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, ChevronRight, Footprints, Plus, Soup } from 'lucide-react'
import { api } from '../lib/api'
import { attentionInfo } from '../lib/channels'
import ConnectionBadge from '../components/ConnectionBadge'
import ErrorBanner from '../components/ErrorBanner'

const BUSINESS = {
  shoe: { label: 'Giày/Dép', icon: Footprints },
  food: { label: 'Ăn uống', icon: Soup },
}

function bizOf(store) {
  return BUSINESS[store.business_type] || { label: store.business_type, icon: Footprints }
}

export default function StoreListPage() {
  const [stores, setStores] = useState(null)
  const [error, setError] = useState('')

  function load() {
    setError('')
    setStores(null)
    api.listStores().then(setStores).catch((e) => setError(e.message))
  }

  useEffect(load, [])

  const totalOrders = stores?.reduce((sum, s) => sum + s.order_count, 0) ?? 0
  const attention = stores?.map((s) => ({ store: s, info: attentionInfo(s) })).filter((r) => r.info) ?? []
  const healthy = stores?.filter((s) => !attentionInfo(s)) ?? []

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Tổng quan</h1>
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

      {stores && (
        <p className="mb-7 text-sm text-fg2">
          {stores.length} cửa hàng
          {attention.length > 0 && (
            <>
              {' · '}
              <span className="font-medium text-amber-600 dark:text-amber-400">{attention.length} cần xử lý</span>
            </>
          )}
          {' · '}
          {totalOrders} đơn qua bot
        </p>
      )}

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
                {attention.map(({ store: s, info }) => {
                  const biz = bizOf(s)
                  const Icon = biz.icon
                  return (
                    <div
                      key={s.id}
                      className="card flex flex-wrap items-start justify-between gap-4 border-amber-500/25 bg-amber-500/[0.04] p-5"
                    >
                      <div className="flex items-start gap-3.5">
                        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                          <AlertTriangle size={18} />
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <Icon size={15} className="text-fg3" />
                            <h3 className="text-base font-semibold text-fg">{s.name}</h3>
                          </div>
                          <p className="mt-0.5 text-sm text-fg/60">
                            {biz.label} · {s.menu_count} món · {s.order_count} đơn
                          </p>
                          <p className="mt-1.5 text-sm text-amber-700 dark:text-amber-300">{info.reason}</p>
                        </div>
                      </div>
                      <Link
                        to={`/stores/${s.id}?tab=channels`}
                        className="btn-primary flex shrink-0 items-center gap-1.5 self-center px-3.5 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                      >
                        Kết nối ngay
                        <ArrowRight size={15} />
                      </Link>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {healthy.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-fg">
                {attention.length > 0 ? `Đang hoạt động tốt (${healthy.length})` : 'Cửa hàng'}
              </h2>
              <div className="card overflow-hidden">
                {healthy.map((s, i) => {
                  const biz = bizOf(s)
                  const Icon = biz.icon
                  return (
                    <Link
                      key={s.id}
                      to={`/stores/${s.id}`}
                      className={
                        'group flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-fg/[0.03] focus-visible:bg-fg/[0.03] focus-visible:outline-none ' +
                        (i > 0 ? 'border-t border-fg/[0.06]' : '')
                      }
                    >
                      <div className="flex items-center gap-3.5">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fg/[0.06] text-fg/70 transition-colors group-hover:bg-indigo-500/15 group-hover:text-indigo-300">
                          <Icon size={18} />
                        </span>
                        <div>
                          <h3 className="text-sm font-semibold text-fg">{s.name}</h3>
                          <p className="text-xs text-fg/55">{biz.label}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <ConnectionBadge connected={s.fb_connected} />
                        <div className="hidden gap-4 text-sm text-fg/60 sm:flex">
                          <span>{s.menu_count} món</span>
                          <span>{s.order_count} đơn</span>
                        </div>
                        <ChevronRight size={18} className="text-fg/30 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-300" />
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
