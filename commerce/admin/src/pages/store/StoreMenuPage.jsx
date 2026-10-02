import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Lock, Pencil, ShoppingBasket, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { IS_PORTAL } from '../../lib/console'
import { useConfirm } from '../../hooks/useConfirm'
import ConfirmDialog from '../../components/ConfirmDialog'
import EmptyState from '../../components/EmptyState'
import ErrorBanner from '../../components/ErrorBanner'

export default function StoreMenuPage() {
  const { store, reload } = useOutletContext()
  return <MenuTab store={store} onChanged={reload} />
}

const EMPTY_MENU_FORM = { code: '', name: '', category: '', price: '', color: '', sizesText: '', stockQtyText: '' }

// "39:5, 40:3" -> {"39": 5, "40": 3} — input dạng chuỗi gọn thay vì 1 ô nhập riêng cho
// từng size trong dải (size giày 35–43 là 9 ô, danh sách nhãn tự đặt dài hơn còn nhiều
// hơn) — không khả thi vẽ hết thành input riêng lẻ trong 1 form thêm/sửa món gọn nhẹ.
function parseSizesText(text) {
  const out = {}
  for (const part of text.split(',')) {
    const [k, v] = part.split(':').map((s) => s.trim())
    if (!k) continue
    const qty = Number(v)
    out[k] = Number.isFinite(qty) ? qty : 0
  }
  return out
}

function sizesToText(sizes) {
  return Object.entries(sizes || {})
    .map(([k, v]) => `${k}:${v}`)
    .join(', ')
}

function MenuTab({ store, onChanged }) {
  const [error, setError] = useState('')
  const [form, setForm] = useState(EMPTY_MENU_FORM)
  const [editingCode, setEditingCode] = useState(null)
  const { ask, dialogProps } = useConfirm()
  const items = store.menu || []
  const hasVariant = store.variant_mode && store.variant_mode !== 'khong_co'

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  function startEdit(it) {
    setForm({
      code: it.code,
      name: it.name,
      category: it.category || '',
      price: String(it.retail ?? it.price ?? ''),
      color: it.color || '',
      sizesText: sizesToText(it.sizes),
      stockQtyText: it.stock_qty == null ? '' : String(it.stock_qty),
    })
    setEditingCode(it.code)
  }

  function cancelEdit() {
    setForm(EMPTY_MENU_FORM)
    setEditingCode(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      await api.addMenuItem(store.id, {
        code: form.code,
        name: form.name,
        category: form.category,
        price: Number(form.price),
        color: form.color,
        sizes: hasVariant ? parseSizesText(form.sizesText) : {},
        stock_qty: !hasVariant && form.stockQtyText.trim() ? Number(form.stockQtyText) : null,
      })
      cancelEdit()
      onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  function handleRemove(code) {
    ask({
      title: `Xoá món "${code}" khỏi menu?`,
      confirmLabel: 'Xoá món',
      danger: true,
      onConfirm: () =>
        api
          .removeMenuItem(store.id, code)
          .then(() => {
            if (editingCode === code) cancelEdit()
            onChanged()
          })
          .catch((err) => setError(err.message)),
    })
  }

  if (store.builtin) {
    return (
      <div>
        <ErrorBanner message={error} />
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-fg/[0.06] bg-fg/[0.02] px-4 py-2.5 text-sm text-fg/45">
          <Lock size={14} />
          Cửa hàng demo dựng sẵn — menu chỉ đọc, không sửa được qua trang admin.
        </div>
        <MenuList items={items} hasVariant={hasVariant} readOnly />
      </div>
    )
  }

  return (
    <div>
      <ConfirmDialog {...dialogProps} />
      <ErrorBanner message={error} />
      <form onSubmit={handleSubmit} className="card mb-6 space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <input
            required
            disabled={Boolean(editingCode)}
            placeholder={IS_PORTAL ? 'Mã món (vd A01)' : 'Mã (code)'}
            value={form.code}
            onChange={set('code')}
            className="input disabled:opacity-60"
          />
          <input required placeholder="Tên món" value={form.name} onChange={set('name')} className="input sm:col-span-2" />
          <input placeholder="Nhóm" value={form.category} onChange={set('category')} className="input" />
          <input required type="number" placeholder="Giá" value={form.price} onChange={set('price')} className="input" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input placeholder="Màu (tuỳ chọn)" value={form.color} onChange={set('color')} className="input" />
          {hasVariant ? (
            <div>
              <input
                placeholder={
                  IS_PORTAL
                    ? (store.variant_mode === 'so' ? 'Vd: 39:5, 40:3' : 'Vd: S:5, M:3')
                    : (store.variant_mode === 'so' ? 'Tồn kho theo size, vd 39:5, 40:3' : 'Tồn kho theo nhãn, vd S:5, M:3')
                }
                value={form.sizesText}
                onChange={set('sizesText')}
                className="input"
              />
              {IS_PORTAL && (
                <p className="mt-1 block text-xs text-fg/40">
                  {store.variant_mode === 'so'
                    ? 'Viết theo kiểu size:số_lượng, cách nhau bằng dấu phẩy. Vd 39:5, 40:3 nghĩa là size 39 còn 5, size 40 còn 3.'
                    : 'Viết theo kiểu size:số_lượng, cách nhau bằng dấu phẩy. Vd S:5, M:3 nghĩa là size S còn 5, size M còn 3.'}
                </p>
              )}
            </div>
          ) : (
            <input
              type="number"
              placeholder={IS_PORTAL ? 'Số lượng còn (để trống nếu không đếm tồn kho)' : 'Tồn kho (để trống = không theo dõi)'}
              value={form.stockQtyText}
              onChange={set('stockQtyText')}
              className="input"
            />
          )}
        </div>
        <div className="flex gap-2.5">
          <button type="submit" className="btn-primary flex-1 py-2 text-sm">
            {editingCode ? 'Lưu thay đổi' : '+ Thêm món'}
          </button>
          {editingCode && (
            <button type="button" onClick={cancelEdit} className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-fg hover:bg-fg/[0.05]">
              Huỷ
            </button>
          )}
        </div>
      </form>
      <MenuList items={items} hasVariant={hasVariant} onRemove={handleRemove} onEdit={startEdit} editingCode={editingCode} />
    </div>
  )
}

function MenuList({ items, hasVariant, onRemove, onEdit, editingCode, readOnly }) {
  if (items.length === 0) return <EmptyState icon={ShoppingBasket} text="Chưa có món nào." />
  return (
    <div className="card overflow-hidden">
      <div className="scrollbar-thin max-h-[560px] overflow-x-auto overflow-y-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="sticky top-0 bg-surface text-left text-fg/40">
            <tr>
              <th className="px-5 py-3 font-medium">Mã</th>
              <th className="px-5 py-3 font-medium">Tên món</th>
              <th className="px-5 py-3 font-medium">Nhóm</th>
              {hasVariant && <th className="px-5 py-3 font-medium">Màu</th>}
              {hasVariant && <th className="px-5 py-3 font-medium">Tồn kho theo size</th>}
              {!hasVariant && <th className="px-5 py-3 font-medium">Tồn kho</th>}
              <th className="px-5 py-3 text-right font-medium">Giá</th>
              {!readOnly && <th className="px-5 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-fg/[0.05]">
            {items.map((it) => (
              <tr
                key={it.code}
                className={'transition-colors hover:bg-fg/[0.02] ' + (editingCode === it.code ? 'bg-indigo-500/[0.06]' : '')}
              >
                <td className="px-5 py-3 text-fg/40">{it.code}</td>
                <td className="px-5 py-3 text-fg/90">{it.name}</td>
                <td className="px-5 py-3 text-fg/50">{it.category}</td>
                {hasVariant && <td className="px-5 py-3 text-fg/50">{it.color || '—'}</td>}
                {hasVariant && (
                  <td className="px-5 py-3 text-fg/50">
                    {Object.keys(it.sizes || {}).length > 0 ? sizesToText(it.sizes) : (
                      <span className="text-amber-600 dark:text-amber-400">Chưa có size — bot không bán được món này</span>
                    )}
                  </td>
                )}
                {!hasVariant && (
                  <td className="px-5 py-3 text-fg/50">
                    {it.stock_qty == null ? <span className="text-fg/30">Không theo dõi</span> : it.stock_qty}
                  </td>
                )}
                <td className="px-5 py-3 text-right text-fg/90">{Number(it.retail ?? it.price).toLocaleString('vi-VN')}đ</td>
                {!readOnly && (
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEdit(it)}
                        aria-label={`Sửa món ${it.code}`}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-fg/30 transition-colors hover:bg-fg/[0.04] hover:text-fg/70"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => onRemove(it.code)}
                        aria-label={`Xoá món ${it.code}`}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-fg/30 transition-colors hover:bg-fg/[0.04] hover:text-red-400"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-fg/[0.06] px-5 py-2.5 text-xs text-fg/35">{items.length} món</div>
    </div>
  )
}
