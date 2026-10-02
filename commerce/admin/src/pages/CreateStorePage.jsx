import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Copy, PlusCircle } from 'lucide-react'
import { api } from '../lib/api'
import { bizOf } from '../lib/business'
import ErrorBanner from '../components/ErrorBanner'

const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/

const initial = {
  id: '',
  name: '',
  business_type: '',
  unit: '',
  variant_mode: 'khong_co',
  variant_min: 24,
  variant_max: 46,
  variant_labels: '',
  fb_page_id: '',
  fb_page_token: '',
  tone: 'warm',
  owner_email: '',
  owner_password: '',
  plan_id: '',
}

export default function CreateStorePage() {
  const [form, setForm] = useState(initial)
  const [types, setTypes] = useState(null)
  const [plans, setPlans] = useState(null)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState(null)
  const navigate = useNavigate()

  // Danh sách ngành hàng lấy TỪ BACKEND (app/business_types.py) — không hardcode ở đây
  // nữa, để thêm 1 ngành mới chỉ cần sửa Python, trang này tự vẽ thêm nút mà không cần
  // build lại riêng phần chọn ngành.
  useEffect(() => {
    api.listBusinessTypes()
      .then((list) => {
        setTypes(list)
        if (list.length > 0) applyBusinessType(list[0])
      })
      .catch((e) => setError(e.message))
    // Danh sách gói cũng lấy từ backend (app/plans.py) — cùng lý do: thêm 1 gói mới chỉ
    // sửa Python, không phải build lại admin UI.
    api.listPlans()
      .then((list) => {
        setPlans(list)
        // Mặc định "basic" (gói bán cho khách thật) chứ không phải gói xếp đầu tiên khi
        // sort theo order — order 0 là "internal_unlimited" (nội bộ/demo), không nên là
        // lựa chọn ngầm định khi cấp tài khoản cho một khách hàng trả phí thật.
        const def = list.find((p) => p.key === 'basic') || list[0]
        if (def) setForm((f) => ({ ...f, plan_id: def.key }))
      })
      .catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  function applyBusinessType(t) {
    setForm((f) => ({
      ...f,
      business_type: t.key,
      variant_mode: t.variant_mode,
      variant_min: t.variant_min,
      variant_max: t.variant_max,
      variant_labels: (t.variant_labels || []).join(', '),
      // Luôn ghi đè theo ngành mới chọn (giống mọi field khác ở trên) — trước đây dùng
      // `f.unit || t.unit` định để "không đè nếu người dùng đã tự sửa tay", nhưng vì ngành
      // đầu tiên được TỰ ĐỘNG áp lúc mount (unit không còn rỗng từ lần đó), mọi lần đổi
      // ngành SAU đó không bao giờ cập nhật lại đơn vị nữa — bug tìm thấy khi test thật:
      // đổi từ "Ăn uống" sang "Thời trang", đơn vị vẫn hiện "phần" thay vì "cái".
      unit: t.unit,
    }))
  }

  function validate(payload) {
    const errs = {}
    if (!ID_RE.test(payload.id)) {
      errs.id = 'Chỉ chữ thường a-z, số và dấu gạch ngang, bắt đầu bằng chữ/số, dài 2-64 ký tự (vd: chao-o-hoen).'
    }
    if (payload.variant_mode === 'nhan' && payload.variant_labels.length === 0) {
      errs.variant_labels = "Kiểu 'danh sách nhãn tự đặt' cần ít nhất 1 nhãn (vd S, M, L)."
    }
    if (payload.variant_mode === 'so' && payload.variant_min > payload.variant_max) {
      errs.variant_min = 'Số nhỏ nhất phải nhỏ hơn hoặc bằng số lớn nhất.'
    }
    if (!payload.owner_email) {
      errs.owner_email = 'Cần email để tạo tài khoản đăng nhập cho chủ cửa hàng.'
    }
    if (payload.owner_password.length < 6) {
      errs.owner_password = 'Mật khẩu cần ít nhất 6 ký tự.'
    }
    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const payload = {
      ...form,
      id: form.id.trim().toLowerCase(),
      variant_min: Number(form.variant_min) || 0,
      variant_max: Number(form.variant_max) || 0,
      variant_labels: form.variant_labels.split(',').map((s) => s.trim()).filter(Boolean),
    }
    const errs = validate(payload)
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return
    setSaving(true)
    try {
      const st = await api.createStore(payload)
      // Màn bàn giao (P1-3) THAY vì navigate thẳng tới chi tiết — chỉ hiện khi tạo
      // THÀNH CÔNG; lỗi (vd email trùng) vẫn giữ nguyên form + ErrorBanner như cũ (nhánh
      // catch bên dưới không đổi).
      setCreated(st)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (created) {
    return <HandoffScreen store={created} ownerEmail={form.owner_email} navigate={navigate} />
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg border-2 border-indigo-800 bg-indigo-700 shadow-[2px_2px_0_var(--color-indigo-800)]">
          <PlusCircle size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Tạo cửa hàng mới</h1>
          <p className="text-sm text-fg/45">Bot sẽ trả lời khách trên Facebook ngay sau khi tạo và bật kênh, không cần deploy lại.</p>
        </div>
      </div>

      <ErrorBanner message={error} />

      <form onSubmit={handleSubmit} className="card p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Mã cửa hàng (id)" hint="Chữ thường, không dấu, không khoảng trắng — dùng nội bộ" error={fieldErrors.id}>
            <input required value={form.id} onChange={set('id')} className="input" placeholder="chao-o-hoen" />
          </Field>
          <Field label="Tên cửa hàng">
            <input required value={form.name} onChange={set('name')} className="input" placeholder="Cháo Nghêu O Hoèn" />
          </Field>
        </div>

        <div className="mt-5">
          <span className="mb-2 block text-sm font-medium text-fg/80">Ngành hàng</span>
          <p className="mb-2.5 text-xs text-fg/40">
            Chọn đúng ngành để AI tư vấn đúng kiểu (hỏi size hay hỏi số phần, có gợi ý topping hay
            không...) và áp policy giao hàng/thanh toán mặc định phù hợp — không phải chỉ đổi tên gọi.
          </p>
          {!types && !error && <p className="text-sm text-fg/40">Đang tải danh sách ngành…</p>}
          {types && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {types.map((t) => (
                <BusinessOption
                  key={t.key}
                  label={t.label}
                  hint={t.hint}
                  icon={bizOf({ business_type: t.key }).icon}
                  active={form.business_type === t.key}
                  onClick={() => applyBusinessType(t)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 border-t border-fg/[0.06] pt-5">
          <h3 className="mb-4 text-sm font-semibold text-fg/70">
            Đơn vị &amp; kiểu biến thể — đã điền theo ngành vừa chọn, sửa lại nếu cần
          </h3>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Đơn vị tính" hint="Vd: đôi, phần, cái, ly, lượt...">
              <input value={form.unit} onChange={set('unit')} className="input" placeholder="phần" />
            </Field>
            <Field label="Kiểu biến thể">
              <select value={form.variant_mode} onChange={set('variant_mode')} className="input">
                <option value="khong_co">Không có (chỉ số lượng)</option>
                <option value="so">Số trong 1 dải (vd size giày)</option>
                <option value="nhan">Danh sách nhãn tự đặt (vd S, M, L)</option>
              </select>
            </Field>
          </div>
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

        <div className="mt-6 border-t border-fg/[0.06] pt-5">
          <h3 className="mb-4 text-sm font-semibold text-fg/70">Kết nối Fanpage (có thể để trống, điền sau)</h3>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Facebook Page ID">
              <input value={form.fb_page_id} onChange={set('fb_page_id')} className="input" placeholder="110194..." />
            </Field>
            <Field label="Page Access Token">
              <input value={form.fb_page_token} onChange={set('fb_page_token')} className="input" placeholder="EAAG..." />
            </Field>
          </div>
        </div>

        <div className="mt-5">
          <Field label="Tone giọng văn" hint="Áp trực tiếp vào cách AI trả lời khách">
            <select value={form.tone} onChange={set('tone')} className="input max-w-xs">
              <option value="warm">Ấm áp, thân thiện</option>
              <option value="professional">Chuyên nghiệp</option>
            </select>
          </Field>
        </div>

        <div className="mt-6 border-t border-fg/[0.06] pt-5">
          <h3 className="mb-1 text-sm font-semibold text-fg/70">Tài khoản chủ cửa hàng</h3>
          <p className="mb-4 text-xs text-fg/40">
            Cửa hàng mới luôn thuộc một khách hàng (tenant) riêng — chủ cửa hàng đăng nhập bằng tài
            khoản này để tự cấu hình, không thấy được cửa hàng của khách hàng khác.
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Email đăng nhập" error={fieldErrors.owner_email}>
              <input
                type="email"
                value={form.owner_email}
                onChange={set('owner_email')}
                className="input"
                placeholder="chuxxx@example.com"
              />
            </Field>
            <Field label="Mật khẩu" hint="Ít nhất 6 ký tự" error={fieldErrors.owner_password}>
              <input
                type="password"
                value={form.owner_password}
                onChange={set('owner_password')}
                className="input"
                placeholder="••••••••"
              />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Gói dịch vụ" hint="Quyết định những kênh/tính năng cửa hàng được dùng">
              {!plans && !error && <p className="text-sm text-fg/40">Đang tải danh sách gói…</p>}
              {plans && (
                <select value={form.plan_id} onChange={set('plan_id')} className="input max-w-xs">
                  {plans.map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn-primary mt-7 w-full py-2.5">
          {saving ? 'Đang tạo…' : 'Tạo cửa hàng'}
        </button>
      </form>
    </div>
  )
}

// Màn bàn giao sau khi tạo cửa hàng (P1-3) — liệt kê link đăng nhập cổng tự phục vụ +
// email chủ cửa hàng. KHÔNG hiện lại mật khẩu (mặc định an toàn hơn theo kế hoạch —
// admin vừa tự gõ mật khẩu lúc tạo, để họ tự nhớ/lưu riêng thay vì hệ thống hiện lại).
function HandoffScreen({ store, ownerEmail, navigate }) {
  const [copied, setCopied] = useState(false)
  const portalUrl = `${window.location.origin}/portal`

  function handleCopy() {
    const text = `Link đăng nhập: ${portalUrl}\nEmail: ${ownerEmail}\n(Mật khẩu đã đặt lúc tạo cửa hàng — gửi riêng cho khách, hệ thống không hiển thị lại.)`
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="card p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
            <Check size={20} />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-fg">Tạo cửa hàng thành công</h1>
            <p className="text-sm text-fg/45">Bàn giao thông tin đăng nhập cho chủ cửa hàng.</p>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-fg/[0.08] bg-fg/[0.02] p-4 text-sm">
          <div>
            <span className="block text-xs font-medium text-fg/40">Link đăng nhập cổng tự phục vụ</span>
            <span className="text-fg/90">{portalUrl}</span>
          </div>
          <div>
            <span className="block text-xs font-medium text-fg/40">Email chủ cửa hàng</span>
            <span className="text-fg/90">{ownerEmail}</span>
          </div>
          <p className="text-xs text-fg/40">
            Mật khẩu đã đặt lúc tạo cửa hàng ở bước trước — gửi riêng cho khách qua kênh an toàn
            (không phải hệ thống này), hệ thống không lưu/hiển thị lại mật khẩu đó.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3.5 py-2 text-sm font-medium text-fg transition-colors hover:bg-fg/[0.05]"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Đã copy' : 'Copy thông tin'}
          </button>
          <button type="button" onClick={() => navigate(`/stores/${store.id}/config`)} className="btn-primary px-4 py-2 text-sm">
            Tới chi tiết cửa hàng
          </button>
        </div>
      </div>
    </div>
  )
}

function BusinessOption({ icon: Icon, label, hint, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ' +
        (active
          ? 'border-indigo-400/50 bg-indigo-500/10'
          : 'border-fg/[0.08] bg-fg/[0.02] hover:bg-fg/[0.04]')
      }
    >
      <span className={'flex h-9 w-9 items-center justify-center rounded-lg ' + (active ? 'bg-indigo-500/20 text-indigo-300' : 'bg-fg/[0.06] text-fg/50')}>
        <Icon size={17} />
      </span>
      <div>
        <div className="text-sm font-medium text-fg">{label}</div>
        <div className="text-xs text-fg/40">{hint}</div>
      </div>
    </button>
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
