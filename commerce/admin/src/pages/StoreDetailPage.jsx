import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  ClipboardList,
  Eye,
  EyeOff,
  KeyRound,
  Layers,
  Lock,
  Radio,
  Settings2,
  ShoppingBasket,
  Sparkles,
  Trash2,
  Truck,
  UserRound,
} from 'lucide-react'
import { api } from '../lib/api'
import { bizOf } from '../lib/business'
import { CHANNEL_LABELS } from '../lib/channels'
import { useAuth } from '../lib/auth'
import ConnectionBadge from '../components/ConnectionBadge'
import ChannelsTab from '../components/ChannelsTab'
import ErrorBanner from '../components/ErrorBanner'

const TABS = [
  { key: 'config', label: 'Cấu hình', icon: Settings2 },
  { key: 'channels', label: 'Kênh', icon: Radio },
  { key: 'menu', label: 'Menu', icon: ShoppingBasket },
  { key: 'orders', label: 'Đơn hàng', icon: ClipboardList },
]

export default function StoreDetailPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const [store, setStore] = useState(null)
  const [error, setError] = useState('')
  // Cho phép link ngoài (vd nút CTA ở Tổng quan) mở thẳng đúng tab, vd /stores/x?tab=channels.
  const requestedTab = searchParams.get('tab')
  const [tab, setTab] = useState(TABS.some((t) => t.key === requestedTab) ? requestedTab : 'config')

  function reload() {
    api.getStore(id).then(setStore).catch((e) => setError(e.message))
  }

  useEffect(reload, [id])

  if (error) return <ErrorBanner message={error} />
  if (!store) return <p className="text-fg/50">Đang tải…</p>

  return (
    <div>
      <Link to="/" className="mb-5 inline-flex items-center gap-1.5 text-sm text-fg/45 hover:text-fg/75">
        <ArrowLeft size={14} />
        Danh sách cửa hàng
      </Link>

      <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">{store.name}</h1>
            <BizBadge store={store} />
            <PlanBadge store={store} />
          </div>
          <p className="mt-1 text-sm text-fg/45">
            {store.menu_count} món · {store.order_count} đơn đã chốt qua bot
          </p>
        </div>
        <ConnectionBadge connected={store.fb_connected} />
      </div>

      <div className="mb-7 inline-flex gap-1 rounded-xl border border-fg/[0.06] bg-fg/[0.02] p-1">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={
                'flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ' +
                (active ? 'bg-fg/[0.08] text-fg' : 'text-fg/45 hover:text-fg/75')
              }
            >
              <Icon size={15} />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'config' && <ConfigTab store={store} onSaved={reload} />}
      {tab === 'channels' && <ChannelsTab store={store} onChanged={reload} />}
      {tab === 'menu' && <MenuTab store={store} onChanged={reload} />}
      {tab === 'orders' && <OrdersTab storeId={store.id} />}
    </div>
  )
}

function ConfigTab({ store, onSaved }) {
  const pol = store.policies || {}
  const [form, setForm] = useState({
    name: store.name,
    shop_label: store.shop_label || '',
    tone: store.tone,
    status: store.status,
    custom_prompt: store.custom_prompt || '',
    variant_mode: store.variant_mode || 'so',
    variant_min: store.variant_min ?? 24,
    variant_max: store.variant_max ?? 46,
    variant_labels: (store.variant_labels || []).join(', '),
    policy_van_chuyen: pol.van_chuyen || '',
    policy_thanh_toan: pol.thanh_toan || '',
    policy_doi_tra: pol.doi_tra || '',
  })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const set = (key) => (e) => {
    setSaved(false)
    setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  function validate(variant_mode, variant_min, variant_max, labels) {
    const errs = {}
    if (variant_mode === 'nhan' && labels.length === 0) {
      errs.variant_labels = "Kiểu 'danh sách nhãn tự đặt' cần ít nhất 1 nhãn (vd S, M, L)."
    }
    if (variant_mode === 'so' && variant_min > variant_max) {
      errs.variant_min = 'Số nhỏ nhất phải nhỏ hơn hoặc bằng số lớn nhất.'
    }
    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaved(false)
    const variant_min = Number(form.variant_min) || 0
    const variant_max = Number(form.variant_max) || 0
    const variant_labels = form.variant_labels.split(',').map((s) => s.trim()).filter(Boolean)
    const errs = validate(form.variant_mode, variant_min, variant_max, variant_labels)
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return
    setSaving(true)
    try {
      const { policy_van_chuyen, policy_thanh_toan, policy_doi_tra, ...rest } = form
      const patch = {
        ...rest,
        variant_min,
        variant_max,
        variant_labels,
        policies: {
          van_chuyen: policy_van_chuyen,
          thanh_toan: policy_thanh_toan,
          doi_tra: policy_doi_tra,
        },
      }
      await api.updateStore(store.id, patch)
      setSaved(true)
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-[1100px] mx-auto">
      <OwnerAccountCard store={store} />
      <PlanCard store={store} onChanged={onSaved} />
      <form onSubmit={handleSubmit} className="mt-6">
      <ErrorBanner message={error} />
      <div className="grid gap-6">
        <div className="card space-y-5 p-6">
          <h3 className="text-sm font-semibold text-fg/70">Thông tin cửa hàng</h3>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Tên cửa hàng">
              <input value={form.name} onChange={set('name')} className="input" />
            </Field>
            <Field label="Tên hiển thị khi chào khách">
              <input value={form.shop_label} onChange={set('shop_label')} className="input" />
            </Field>
            <Field label="Tone giọng văn">
              <select value={form.tone} onChange={set('tone')} className="input">
                <option value="warm">Ấm áp, thân thiện</option>
                <option value="professional">Chuyên nghiệp</option>
              </select>
            </Field>
            <Field label="Trạng thái">
              <select value={form.status} onChange={set('status')} className="input">
                <option value="active">Đang hoạt động</option>
                <option value="paused">Tạm dừng</option>
              </select>
            </Field>
          </div>

          <div className="border-t border-fg/[0.06] pt-4">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                <Layers size={16} />
              </span>
              <h3 className="text-sm font-semibold text-fg/80">Kiểu biến thể sản phẩm</h3>
            </div>
            <Field label="Kiểu" hint="Để bot hiểu đúng khi khách gõ size/biến thể trong chat — không chỉ giày">
              <select value={form.variant_mode} onChange={set('variant_mode')} className="input">
                <option value="so">Số trong 1 dải (vd size giày 35–43)</option>
                <option value="nhan">Danh sách nhãn tự đặt (vd S, M, L, XL)</option>
                <option value="khong_co">Không có biến thể (chỉ số lượng)</option>
              </select>
            </Field>
            {form.variant_mode === 'so' && (
              <div className="mt-4 grid grid-cols-2 gap-4">
                <Field label="Số nhỏ nhất" error={fieldErrors.variant_min}>
                  <input type="number" value={form.variant_min} onChange={set('variant_min')} className="input" />
                </Field>
                <Field label="Số lớn nhất">
                  <input type="number" value={form.variant_max} onChange={set('variant_max')} className="input" />
                </Field>
              </div>
            )}
            {form.variant_mode === 'nhan' && (
              <div className="mt-4">
                <Field label="Danh sách nhãn" hint="Cách nhau bằng dấu phẩy" error={fieldErrors.variant_labels}>
                  <input value={form.variant_labels} onChange={set('variant_labels')} className="input" placeholder="S, M, L, XL" />
                </Field>
              </div>
            )}
          </div>

          <div className="border-t border-fg/[0.06] pt-4">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
                <Truck size={16} />
              </span>
              <h3 className="text-sm font-semibold text-fg/80">Chính sách trả lời khách</h3>
            </div>
            <p className="mb-3 text-xs text-fg/35">
              Bot đọc NGUYÊN VĂN 3 câu này khi khách hỏi ship/thanh toán/đổi trả — mặc định lúc tạo
              lấy theo ngành hàng, có thể sai địa điểm/thời gian cụ thể của cửa hàng bạn, nên sửa lại
              cho đúng trước khi kết nối kênh thật.
            </p>
            <div className="space-y-3">
              <Field label="Vận chuyển / giao hàng">
                <textarea value={form.policy_van_chuyen} onChange={set('policy_van_chuyen')}
                          className="input min-h-[70px] resize-y" />
              </Field>
              <Field label="Thanh toán">
                <textarea value={form.policy_thanh_toan} onChange={set('policy_thanh_toan')}
                          className="input min-h-[70px] resize-y" />
              </Field>
              <Field label="Đổi trả">
                <textarea value={form.policy_doi_tra} onChange={set('policy_doi_tra')}
                          className="input min-h-[70px] resize-y" />
              </Field>
            </div>
          </div>

          <div className="border-t border-fg/[0.06] pt-4">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
                <Sparkles size={16} />
              </span>
              <h3 className="text-sm font-semibold text-fg/80">Prompt tuỳ chỉnh cho AI (nâng cao)</h3>
            </div>
            <textarea
              value={form.custom_prompt}
              onChange={set('custom_prompt')}
              className="input min-h-[110px] resize-y"
              placeholder="Vd: Luôn gợi ý thêm phụ kiện đi kèm. Không nói về đối thủ..."
            />
            <p className="mt-1.5 text-xs text-fg/35">
              Ngành hàng đã chọn (xem badge ở đầu trang) tự động chỉnh cách AI tư vấn (hỏi size hay hỏi
              số phần, có gợi ý topping...) và Tone giọng văn ở trên tự chỉnh cách xưng hô — ô này chỉ
              để thêm quy tắc RIÊNG ngoài 2 cái đó (vd không nói về đối thủ). Nối thêm vào rule gốc,
              không thay hẳn — AI vẫn không bịa sản phẩm/giá ngoài dữ liệu thật.
            </p>
          </div>

          <button type="submit" disabled={saving} className="btn-primary w-full py-2.5">
            {saving ? 'Đang lưu…' : saved ? 'Đã lưu ✓' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
      </form>
    </div>
  )
}

// Tài khoản đăng nhập cổng tự phục vụ (/portal) của chủ cửa hàng — TÁCH KHỎI <form>
// cấu hình bot ở trên vì đây là sửa bảng `users` (danh tính đăng nhập), không phải
// sửa dữ liệu `stores`; gộp chung 1 form rất dễ gây hiểu lầm "Lưu thay đổi" cũng đổi
// luôn mật khẩu. 3 cửa hàng demo builtin không có owner_email (dùng chung tenant nội
// bộ) — hiện ghi chú giải thích thay vì khối trống khó hiểu.
function OwnerAccountCard({ store }) {
  const { user } = useAuth()
  const [resetting, setResetting] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleReset(e) {
    e.preventDefault()
    setError('')
    if (newPassword.length < 6) {
      setError('Mật khẩu cần ít nhất 6 ký tự.')
      return
    }
    setBusy(true)
    try {
      await api.resetOwnerPassword(store.id, newPassword)
      setDone(true)
      setNewPassword('')
      setResetting(false)
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
          <UserRound size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-fg">Tài khoản chủ cửa hàng</h3>
          {store.owner_email ? (
            <>
              <p className="mt-0.5 text-xs text-fg/45">
                Đăng nhập tại cổng tự phục vụ (<code className="text-fg/60">/portal</code>) bằng email này.
              </p>
              <p className="mt-2.5 text-sm text-fg/90">{store.owner_email}</p>

              {user?.role === 'super_admin' && (
                <div className="mt-3.5 border-t border-fg/[0.06] pt-3.5">
                  <ErrorBanner message={error} />
                  {done && !resetting && (
                    <p className="mb-2 text-xs text-emerald-700 dark:text-emerald-400">Đã đặt mật khẩu mới ✓</p>
                  )}
                  {!resetting ? (
                    <button
                      type="button"
                      onClick={() => { setResetting(true); setDone(false) }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-fg/[0.05]"
                    >
                      <KeyRound size={13} />
                      Đặt lại mật khẩu
                    </button>
                  ) : (
                    <form onSubmit={handleReset} className="flex flex-wrap items-start gap-2.5">
                      <div className="relative">
                        <input
                          autoFocus
                          type={showPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Mật khẩu mới (≥ 6 ký tự)"
                          className="input w-56 pr-9 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((s) => !s)}
                          aria-label={showPassword ? 'Ẩn' : 'Hiện'}
                          className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-fg/40 hover:text-fg/70"
                        >
                          {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <button type="submit" disabled={busy} className="btn-primary px-3.5 py-2 text-xs">
                        {busy ? 'Đang lưu…' : 'Xác nhận'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setResetting(false); setNewPassword(''); setError('') }}
                        className="px-2 py-2 text-xs font-medium text-fg/45 hover:text-fg/75"
                      >
                        Huỷ
                      </button>
                    </form>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="mt-1.5 text-xs text-fg/40">
              Cửa hàng demo dựng sẵn, dùng chung tài khoản nội bộ — không có chủ sở hữu riêng.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// Khối "Gói dịch vụ" — hiển thị gói hiện tại + feature set cho MỌI role; chỉ super_admin
// (Q4) mới thấy control đổi gói (select + nút Lưu). tenant_owner chỉ xem, kèm hướng dẫn
// tĩnh "Liên hệ quản trị viên" (Q5-b, không phải mailto bấm được vì chưa có email hỗ trợ
// thật). TÁCH KHỎI <form> cấu hình bot (giống lý do OwnerAccountCard tách riêng) — đổi
// gói là sửa bảng `tenants`, không phải `stores`.
function PlanCard({ store, onChanged }) {
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
    <div className="card mt-6 p-6">
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

function MenuTab({ store, onChanged }) {
  const [error, setError] = useState('')
  const [form, setForm] = useState({ code: '', name: '', category: '', price: '' })
  const items = store.menu || []

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function handleAdd(e) {
    e.preventDefault()
    setError('')
    try {
      await api.addMenuItem(store.id, { ...form, price: Number(form.price) })
      setForm({ code: '', name: '', category: '', price: '' })
      onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRemove(code) {
    if (!window.confirm(`Xoá món "${code}" khỏi menu?`)) return
    setError('')
    try {
      await api.removeMenuItem(store.id, code)
      onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  if (store.builtin) {
    return (
      <div>
        <ErrorBanner message={error} />
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-fg/[0.06] bg-fg/[0.02] px-4 py-2.5 text-sm text-fg/45">
          <Lock size={14} />
          Cửa hàng demo dựng sẵn — menu chỉ đọc, không sửa được qua trang admin.
        </div>
        <MenuList items={items} readOnly />
      </div>
    )
  }

  return (
    <div>
      <ErrorBanner message={error} />
      <form onSubmit={handleAdd} className="card mb-6 grid grid-cols-2 gap-3 p-4 sm:grid-cols-5">
        <input required placeholder="Mã (code)" value={form.code} onChange={set('code')} className="input" />
        <input required placeholder="Tên món" value={form.name} onChange={set('name')} className="input sm:col-span-2" />
        <input placeholder="Nhóm" value={form.category} onChange={set('category')} className="input" />
        <input required type="number" placeholder="Giá" value={form.price} onChange={set('price')} className="input" />
        <button type="submit" className="btn-primary col-span-2 py-2 text-sm sm:col-span-5">
          + Thêm món
        </button>
      </form>
      <MenuList items={items} onRemove={handleRemove} />
    </div>
  )
}

function MenuList({ items, onRemove, readOnly }) {
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
              <th className="px-5 py-3 text-right font-medium">Giá</th>
              {!readOnly && <th className="px-5 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-fg/[0.05]">
            {items.map((it) => (
              <tr key={it.code} className="transition-colors hover:bg-fg/[0.02]">
                <td className="px-5 py-3 text-fg/40">{it.code}</td>
                <td className="px-5 py-3 text-fg/90">{it.name}</td>
                <td className="px-5 py-3 text-fg/50">{it.category}</td>
                <td className="px-5 py-3 text-right text-fg/90">{Number(it.retail ?? it.price).toLocaleString('vi-VN')}đ</td>
                {!readOnly && (
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => onRemove(it.code)}
                      aria-label={`Xoá món ${it.code}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-fg/30 transition-colors hover:bg-fg/[0.04] hover:text-red-400"
                    >
                      <Trash2 size={15} />
                    </button>
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

function OrdersTab({ storeId }) {
  const [orders, setOrders] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.listOrders(storeId).then(setOrders).catch((e) => setError(e.message))
  }, [storeId])

  if (error) return <ErrorBanner message={error} />
  if (!orders) return <p className="text-fg/50">Đang tải…</p>
  if (orders.length === 0) return <EmptyState icon={ClipboardList} text="Chưa có đơn nào." />

  const sorted = [...orders].sort((a, b) => (b.flagged ? 1 : 0) - (a.flagged ? 1 : 0))
  const flaggedCount = orders.filter((o) => o.flagged).length

  return (
    <div className="card overflow-hidden">
      {flaggedCount > 0 && (
        <div className="flex items-center gap-2 border-b border-rose-500/20 bg-rose-500/10 px-5 py-2.5 text-sm text-rose-700 dark:text-rose-300">
          <AlertTriangle size={15} />
          {flaggedCount} đơn khách đang than phiền, cần kiểm tra
        </div>
      )}
      <div className="scrollbar-thin max-h-[560px] overflow-x-auto overflow-y-auto">
        <table className="w-full min-w-[740px] text-sm">
          <thead className="sticky top-0 bg-surface text-left text-fg/40">
            <tr>
              <th className="px-5 py-3 font-medium">Mã đơn</th>
              <th className="px-5 py-3 font-medium">Khách</th>
              <th className="px-5 py-3 font-medium">Kênh</th>
              <th className="px-5 py-3 font-medium">Trạng thái</th>
              <th className="px-5 py-3 text-right font-medium">Tổng tiền</th>
              <th className="px-5 py-3 font-medium">Lúc</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-fg/[0.05]">
            {sorted.map((o) => (
              <tr
                key={o.id}
                className={'transition-colors hover:bg-fg/[0.02] ' + (o.flagged ? 'bg-rose-500/[0.06]' : '')}
                title={o.flagged ? `Khách phàn nàn: ${o.flag_note || ''}` : undefined}
              >
                <td className="px-5 py-3 text-fg/40">
                  <span className="flex items-center gap-1.5">
                    {Boolean(o.flagged) && <AlertTriangle size={13} className="text-rose-400" />}
                    {o.id}
                  </span>
                </td>
                <td className="px-5 py-3 text-fg/90">{o.customer_name}</td>
                <td className="px-5 py-3">
                  <ChannelPill channel={o.channel} />
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusPill status={o.status} />
                    {Boolean(o.flagged) && (
                      <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-medium text-rose-700 dark:text-rose-400">
                        ⚠️ Cần xử lý
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3 text-right text-fg/90">{Number(o.subtotal).toLocaleString('vi-VN')}đ</td>
                <td className="px-5 py-3 text-fg/40">{o.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-fg/[0.06] px-5 py-2.5 text-xs text-fg/35">{orders.length} đơn</div>
    </div>
  )
}

function StatusPill({ status }) {
  const s = (status || '').toLowerCase()
  let cls = 'bg-fg/[0.06] text-fg/60'
  if (s.includes('huỷ') || s.includes('hủy')) cls = 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
  else if (s.includes('giao') || s.includes('hoàn') || s.includes('xong')) cls = 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
  else if (s.includes('chờ')) cls = 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
  return <span className={'rounded-full px-2.5 py-1 text-xs font-medium ' + cls}>{status}</span>
}

// Nhãn kênh nguồn của đơn (P1-1) — `orders.channel` lưu giá trị đúng theo
// `stores.CHANNEL_TYPES` ("facebook"/"zalo_oa"/"zalo_personal"); giá trị lạ/rỗng (dữ liệu
// cũ chèn tay, không kỳ vọng xảy ra với dữ liệu qua bot vì cột NOT NULL) hiện "—".
function ChannelPill({ channel }) {
  if (!channel) return <span className="text-xs text-fg/30">—</span>
  const label = CHANNEL_LABELS[channel] || channel
  const cls =
    channel === 'facebook'
      ? 'bg-blue-500/15 text-blue-700 dark:text-blue-400'
      : channel === 'zalo_personal'
      ? 'bg-sky-500/15 text-sky-700 dark:text-sky-400'
      : channel === 'zalo_oa'
      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
      : 'bg-fg/[0.06] text-fg/50'
  return <span className={'rounded-full px-2.5 py-1 text-xs font-medium ' + cls}>{label}</span>
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="card flex flex-col items-center gap-2 py-14 text-fg/35">
      <Icon size={24} />
      <p className="text-sm">{text}</p>
    </div>
  )
}

function BizBadge({ store }) {
  const biz = bizOf(store)
  const Icon = biz.icon
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-fg/[0.06] px-2.5 py-1 text-xs font-medium text-fg/60">
      <Icon size={12} />
      {biz.label}
    </span>
  )
}

// Badge gói dịch vụ cạnh BizBadge ở header — chỉ hiển thị (không bấm được ở đây), đổi
// gói thật làm ở khối PlanCard trong tab Cấu hình (xem bên dưới).
function PlanBadge({ store }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300">
      <Box size={12} />
      Gói {store.plan_label}
    </span>
  )
}

function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-fg/80">{label}</span>
      {children}
      {error
        ? <span className="mt-1 block text-xs text-rose-500">{error}</span>
        : hint && <span className="mt-1 block text-xs text-fg/40">{hint}</span>}
    </label>
  )
}
