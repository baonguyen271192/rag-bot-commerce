import { useEffect, useState } from 'react'
import { Pencil, Tag, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { IS_PORTAL } from '../lib/console'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from './ConfirmDialog'
import ErrorBanner from './ErrorBanner'
import EmptyState from './EmptyState'

const EMPTY_FORM = { code: '', type: 'percent', value: '', max_uses: '', expires_at: '' }

export default function CouponsTab({ store }) {
  const [coupons, setCoupons] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingCode, setEditingCode] = useState(null)
  const [saving, setSaving] = useState(false)
  const { ask, dialogProps } = useConfirm()

  function load() {
    api.listCoupons(store.id).then(setCoupons).catch((e) => setError(e.message))
  }
  useEffect(load, [store.id])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  function startEdit(c) {
    setForm({
      code: c.code,
      type: c.type,
      value: String(c.value),
      max_uses: c.max_uses == null ? '' : String(c.max_uses),
      expires_at: c.expires_at || '',
    })
    setEditingCode(c.code)
  }

  function cancelEdit() {
    setForm(EMPTY_FORM)
    setEditingCode(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const max_uses = form.max_uses.trim() ? Number(form.max_uses) : null
    const expires_at = form.expires_at.trim() || null
    try {
      if (editingCode) {
        await api.updateCoupon(store.id, editingCode, {
          type: form.type, value: Number(form.value), max_uses, expires_at,
        })
      } else {
        await api.createCoupon(store.id, {
          code: form.code, type: form.type, value: Number(form.value), max_uses, expires_at,
        })
      }
      cancelEdit()
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleToggleActive(c) {
    api.updateCoupon(store.id, c.code, { active: !c.active }).then(load).catch((e) => setError(e.message))
  }

  function handleDelete(code) {
    ask({
      title: `Xoá mã "${code}"?`,
      confirmLabel: 'Xoá mã',
      danger: true,
      onConfirm: () =>
        api
          .deleteCoupon(store.id, code)
          .then(() => {
            if (editingCode === code) cancelEdit()
            load()
          })
          .catch((err) => setError(err.message)),
    })
  }

  if (store.builtin) {
    return (
      <div className="card flex items-center gap-2 px-4 py-2.5 text-sm text-fg/45">
        Cửa hàng demo dựng sẵn — không tạo khuyến mãi demo được.
      </div>
    )
  }

  return (
    <div>
      <ConfirmDialog {...dialogProps} />
      <ErrorBanner message={error} />
      <form onSubmit={handleSubmit} className="card mb-6 grid grid-cols-2 gap-3 p-4 sm:grid-cols-6">
        <input
          required
          disabled={Boolean(editingCode)}
          placeholder="Mã (vd GIAM50)"
          value={form.code}
          onChange={set('code')}
          className="input disabled:opacity-60"
        />
        <select value={form.type} onChange={set('type')} className="input">
          <option value="percent">Giảm %</option>
          <option value="amount">Giảm số tiền</option>
        </select>
        <input required type="number" placeholder={form.type === 'percent' ? '% (vd 10)' : 'Số tiền (vd 15000)'}
               value={form.value} onChange={set('value')} className="input" />
        <input type="number" placeholder="Giới hạn lượt (để trống = không giới hạn)"
               value={form.max_uses} onChange={set('max_uses')} className="input sm:col-span-2" />
        {/* Ô type="date" bỏ qua placeholder nên /admin vốn chỉ thấy 1 ô trống không rõ là
            gì — lỗi dùng được có sẵn, không riêng portal. BA chốt không đổi gì ở /admin
            lần này; portal thêm 1 nhãn nhìn thấy được để chủ shop không bối rối. */}
        {IS_PORTAL ? (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-fg/80">
              Hết hạn (để trống = không hết hạn)
            </span>
            <input type="date" value={form.expires_at} onChange={set('expires_at')} className="input" />
          </label>
        ) : (
          <input type="date" value={form.expires_at} onChange={set('expires_at')} className="input" />
        )}
        <div className="col-span-2 flex gap-2.5 sm:col-span-6">
          <button type="submit" disabled={saving} className="btn-primary flex-1 py-2 text-sm">
            {saving ? 'Đang lưu…' : editingCode ? 'Lưu thay đổi' : '+ Tạo mã'}
          </button>
          {editingCode && (
            <button type="button" onClick={cancelEdit} className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-fg hover:bg-fg/[0.05]">
              Huỷ
            </button>
          )}
        </div>
      </form>

      {!coupons ? (
        <p className="text-fg/50">Đang tải…</p>
      ) : coupons.length === 0 ? (
        <EmptyState icon={Tag} text="Chưa có mã khuyến mãi nào." />
      ) : (
        <div className="card overflow-hidden">
          <div className="scrollbar-thin max-h-[560px] overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 bg-surface text-left text-fg/40">
                <tr>
                  <th className="px-5 py-3 font-medium">Mã</th>
                  <th className="px-5 py-3 font-medium">Giảm</th>
                  <th className="px-5 py-3 font-medium">Đã dùng</th>
                  <th className="px-5 py-3 font-medium">Hết hạn</th>
                  <th className="px-5 py-3 font-medium">Trạng thái</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-fg/[0.05]">
                {coupons.map((c) => (
                  <tr key={c.code} className={'transition-colors hover:bg-fg/[0.02] ' + (editingCode === c.code ? 'bg-indigo-500/[0.06]' : '')}>
                    <td className="px-5 py-3 font-medium text-fg/90">{c.code}</td>
                    <td className="px-5 py-3 text-fg/70">
                      {c.type === 'percent' ? `${c.value}%` : `${Number(c.value).toLocaleString('vi-VN')}đ`}
                    </td>
                    <td className="px-5 py-3 text-fg/50">{c.used_count}{c.max_uses != null ? ` / ${c.max_uses}` : ''}</td>
                    <td className="px-5 py-3 text-fg/50">{c.expires_at || 'Không hết hạn'}</td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => handleToggleActive(c)}
                        className={
                          'rounded-full px-2.5 py-1 text-xs font-medium transition-colors ' +
                          (c.active ? 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-400'
                                     : 'bg-fg/[0.06] text-fg/45 hover:bg-fg/[0.1]')
                        }
                      >
                        {c.active ? 'Đang bật' : 'Đã tắt'}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => startEdit(c)}
                          aria-label={`Sửa mã ${c.code}`}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-fg/30 transition-colors hover:bg-fg/[0.04] hover:text-fg/70"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(c.code)}
                          aria-label={`Xoá mã ${c.code}`}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-fg/30 transition-colors hover:bg-fg/[0.04] hover:text-red-400"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-fg/[0.06] px-5 py-2.5 text-xs text-fg/35">{coupons.length} mã</div>
        </div>
      )}
    </div>
  )
}
