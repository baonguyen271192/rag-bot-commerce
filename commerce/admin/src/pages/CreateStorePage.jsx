import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Footprints, PlusCircle, Soup } from 'lucide-react'
import { api } from '../lib/api'
import ErrorBanner from '../components/ErrorBanner'

const initial = {
  id: '',
  name: '',
  business_type: 'food',
  unit: '',
  variant_mode: 'khong_co',
  variant_min: 24,
  variant_max: 46,
  variant_labels: '',
  fb_page_id: '',
  fb_page_token: '',
  tone: 'warm',
}

export default function CreateStorePage() {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload = {
        ...form,
        variant_min: Number(form.variant_min) || 0,
        variant_max: Number(form.variant_max) || 0,
        variant_labels: form.variant_labels.split(',').map((s) => s.trim()).filter(Boolean),
      }
      const created = await api.createStore(payload)
      navigate(`/stores/${created.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/30">
          <PlusCircle size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Tạo cửa hàng mới</h1>
          <p className="text-sm text-fg/45">Bot sẽ chạy ngay sau khi tạo, không cần deploy lại.</p>
        </div>
      </div>

      <ErrorBanner message={error} />

      <form onSubmit={handleSubmit} className="card p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Mã cửa hàng (id)" hint="Chữ thường, không dấu, dùng nội bộ">
            <input required value={form.id} onChange={set('id')} className="input" placeholder="chao-o-hoen" />
          </Field>
          <Field label="Tên cửa hàng">
            <input required value={form.name} onChange={set('name')} className="input" placeholder="Cháo Nghêu O Hoèn" />
          </Field>
        </div>

        <div className="mt-5">
          <span className="mb-2 block text-sm font-medium text-fg/80">Ngành hàng</span>
          <div className="grid grid-cols-2 gap-3">
            <BusinessOption
              icon={Soup}
              label="Ăn uống"
              hint="Đặt theo món/phần"
              active={form.business_type === 'food'}
              onClick={() => setForm((f) => ({ ...f, business_type: 'food', variant_mode: 'khong_co' }))}
            />
            <BusinessOption
              icon={Footprints}
              label="Giày/Dép"
              hint="Đặt theo size"
              active={form.business_type === 'shoe'}
              onClick={() => setForm((f) => ({ ...f, business_type: 'shoe', variant_mode: 'so' }))}
            />
          </div>
        </div>

        <div className="mt-6 border-t border-fg/[0.06] pt-5">
          <h3 className="mb-4 text-sm font-semibold text-fg/70">
            Đơn vị &amp; kiểu biến thể — không chỉ giày, sửa lại đây cho đúng ngành thật
          </h3>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Đơn vị tính" hint="Vd: đôi, phần, cái, chiếc...">
              <input value={form.unit} onChange={set('unit')} className="input"
                     placeholder={form.business_type === 'food' ? 'phần' : 'đôi'} />
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
              <Field label="Số nhỏ nhất">
                <input type="number" value={form.variant_min} onChange={set('variant_min')} className="input" />
              </Field>
              <Field label="Số lớn nhất">
                <input type="number" value={form.variant_max} onChange={set('variant_max')} className="input" />
              </Field>
            </div>
          )}
          {form.variant_mode === 'nhan' && (
            <div className="mt-4">
              <Field label="Danh sách nhãn" hint="Cách nhau bằng dấu phẩy">
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
          <Field label="Tone giọng văn">
            <select value={form.tone} onChange={set('tone')} className="input max-w-xs">
              <option value="warm">Ấm áp, thân thiện</option>
              <option value="professional">Chuyên nghiệp</option>
            </select>
          </Field>
        </div>

        <button type="submit" disabled={saving} className="btn-primary mt-7 w-full py-2.5">
          {saving ? 'Đang tạo…' : 'Tạo cửa hàng'}
        </button>
      </form>
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

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-fg/80">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-fg/40">{hint}</span>}
    </label>
  )
}
