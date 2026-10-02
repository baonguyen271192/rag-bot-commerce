import { useEffect, useState } from 'react'
import { Box } from 'lucide-react'
import { api } from '../lib/api'
import { CHANNEL_LABELS } from '../lib/channels'
import { useAuth } from '../lib/auth'
import ErrorBanner from './ErrorBanner'

// Khối "Gói dịch vụ" — hiển thị gói hiện tại + feature set cho MỌI role; chỉ super_admin
// mới thấy control đổi gói (select + nút Lưu), đúng phạm vi admin_set_plan
// (require_super_admin, không đổi). tenant_owner chỉ xem, kèm hướng dẫn tĩnh "Liên hệ
// quản trị viên". Dùng chung cho StoreConfigPage (chủ cửa hàng) và view tóm tắt admin
// (StoreLayout) — đây là 1 trong 2 việc DUY NHẤT admin còn được làm trên 1 cửa hàng.
export default function PlanCard({ store, onChanged }) {
  const { user } = useAuth()
  const [plansList, setPlansList] = useState(null)
  const [planId, setPlanId] = useState(store.plan_id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (user?.role === 'super_admin' && !store.builtin) {
      api.listPlans().then(setPlansList).catch((e) => setError(e.message))
    }
  }, [user?.role, store.builtin])

  useEffect(() => {
    setPlanId(store.plan_id)
    setSaved(false)
  }, [store.plan_id])

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    setSaved(false)
    setBusy(true)
    try {
      await api.setPlan(store.id, planId)
      setSaved(true)
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
          <Box size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-fg">Gói dịch vụ</h3>
          <p className="mt-0.5 text-xs text-fg/45">Quyết định những kênh/tính năng cửa hàng này được dùng.</p>

          {store.builtin ? (
            <p className="mt-3 text-xs text-fg/40">
              Cửa hàng demo dựng sẵn, dùng chung gói nội bộ ({store.plan_label}) — không đổi riêng được.
            </p>
          ) : (
            <>
              <p className="mt-3 text-sm text-fg/90">
                Hiện tại: <strong>{store.plan_label}</strong>
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {(store.plan_features || []).map((f) => (
                  <li key={f} className="rounded-full bg-fg/[0.06] px-2 py-0.5 text-[11px] text-fg/55">
                    {CHANNEL_LABELS[f] || f}
                  </li>
                ))}
              </ul>

              {user?.role === 'super_admin' ? (
                <div className="mt-3.5 border-t border-fg/[0.06] pt-3.5">
                  <ErrorBanner message={error} />
                  {saved && <p className="mb-2 text-xs text-emerald-700 dark:text-emerald-400">Đã đổi gói ✓</p>}
                  <p className="mb-2 text-xs text-fg/40">
                    Gói áp dụng cho TOÀN BỘ cửa hàng của khách hàng này (tenant), không chỉ riêng cửa hàng
                    đang xem. Hạ gói sẽ tự tắt những kênh không còn thuộc gói mới.
                  </p>
                  <form onSubmit={handleSave} className="flex flex-wrap items-center gap-2.5">
                    <select
                      value={planId}
                      onChange={(e) => { setPlanId(e.target.value); setSaved(false) }}
                      className="input w-52 text-sm"
                    >
                      {(plansList || [{ key: store.plan_id, label: store.plan_label }]).map((p) => (
                        <option key={p.key} value={p.key}>{p.label}</option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={busy || planId === store.plan_id}
                      className="btn-primary px-3.5 py-2 text-xs"
                    >
                      {busy ? 'Đang lưu…' : 'Đổi gói'}
                    </button>
                  </form>
                </div>
              ) : (
                <p className="mt-3 text-xs text-fg/40">Liên hệ quản trị viên để nâng cấp gói.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
