import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Box, Layers, Sparkles, Star, Truck } from 'lucide-react'
import { api } from '../../lib/api'
import { IS_PORTAL } from '../../lib/console'
import { useConfirm } from '../../hooks/useConfirm'
import ConfirmDialog from '../../components/ConfirmDialog'
import ErrorBanner from '../../components/ErrorBanner'
import OwnerAccountCard from '../../components/OwnerAccountCard'
import PlanCard from '../../components/PlanCard'

export default function StoreConfigPage() {
  const { store, reload } = useOutletContext()
  return <ConfigTab store={store} onSaved={reload} />
}

function ConfigTab({ store, onSaved }) {
  const pol = store.policies || {}
  const [form, setForm] = useState({
    name: store.name,
    shop_label: store.shop_label || '',
    business_type: store.business_type,
    unit: store.unit || '',
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
    loyalty_spend_per_point: store.loyalty_spend_per_point || '',
    loyalty_redeem_rate: store.loyalty_redeem_rate || '',
  })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [bizTypes, setBizTypes] = useState(null)
  const { ask, dialogProps } = useConfirm()

  useEffect(() => {
    api.listBusinessTypes().then(setBizTypes).catch(() => setBizTypes([]))
  }, [])

  const set = (key) => (e) => {
    setSaved(false)
    setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  // Đổi ngành hàng đổi theo cả đơn vị tính + kiểu biến thể mặc định của ngành đó — ảnh
  // hưởng cách bot hiểu size/số lượng khách gõ, nên KHÔNG tự áp lặng lẽ như lúc tạo mới
  // (CreateStorePage). Sản phẩm đã có trong menu không tự đổi theo.
  function requestBusinessType(t) {
    if (t.key === form.business_type) return
    ask({
      title: `Đổi ngành hàng sang "${t.label}"?`,
      message: IS_PORTAL
        ? `Đơn vị tính sẽ đổi thành "${t.unit}" và cách chia size mặc định sẽ đổi theo ngành này. Sản phẩm ĐÃ CÓ trong menu không tự đổi theo — cần tự kiểm tra lại size/đơn vị cho từng món sau khi lưu.`
        : `Đơn vị tính sẽ đổi thành "${t.unit}" và kiểu biến thể mặc định sẽ đổi theo ngành này. Sản phẩm ĐÃ CÓ trong menu không tự đổi theo — cần tự kiểm tra lại size/đơn vị cho từng món sau khi lưu.`,
      confirmLabel: 'Đổi ngành hàng',
      onConfirm: () => {
        setSaved(false)
        setForm((f) => ({
          ...f,
          business_type: t.key,
          unit: t.unit,
          variant_mode: t.variant_mode,
          variant_min: t.variant_min,
          variant_max: t.variant_max,
          variant_labels: (t.variant_labels || []).join(', '),
        }))
      },
    })
  }

  function validate(variant_mode, variant_min, variant_max, labels) {
    const errs = {}
    if (!form.name.trim()) {
      errs.name = 'Tên cửa hàng không được để trống.'
    }
    if (variant_mode === 'nhan' && labels.length === 0) {
      errs.variant_labels = IS_PORTAL
        ? 'Cần điền ít nhất 1 size (vd S, M, L).'
        : "Kiểu 'danh sách nhãn tự đặt' cần ít nhất 1 nhãn (vd S, M, L)."
    }
    if (variant_mode === 'so' && variant_min > variant_max) {
      errs.variant_range = IS_PORTAL
        ? 'Size nhỏ nhất phải nhỏ hơn hoặc bằng size lớn nhất.'
        : 'Số nhỏ nhất phải nhỏ hơn hoặc bằng số lớn nhất.'
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
        // Gửi 0 (không phải null) khi để trống — backend dùng exclude_none=True nên gửi
        // null sẽ bị BỎ QUA hoàn toàn (không ghi đè được giá trị cũ để tắt loyalty); 0 thì
        // ghi đè bình thường, và mọi điều kiện bật/tắt loyalty ở engine.py/repository.py
        // đều coi 0 falsy y hệt None (`if spend_per_point:`), nên hành vi đúng như ý.
        loyalty_spend_per_point: Number(form.loyalty_spend_per_point) || 0,
        loyalty_redeem_rate: Number(form.loyalty_redeem_rate) || 0,
        policies: {
          van_chuyen: policy_van_chuyen,
          thanh_toan: policy_thanh_toan,
          doi_tra: policy_doi_tra,
        },
      }
      // Portal không hiện ô "Prompt tuỳ chỉnh cho AI" (xem khối ẩn bên dưới) nên form
      // không có giá trị thật để gửi lên — PHẢI xoá hẳn key này khỏi patch, không được
      // gửi chuỗi rỗng: backend lọc patch theo `v is not None` (stores.py), chuỗi "" KHÔNG
      // bị lọc và sẽ GHI ĐÈ xoá custom_prompt cũ do admin đặt.
      if (IS_PORTAL) delete patch.custom_prompt
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
      <ConfirmDialog {...dialogProps} />
      <OwnerAccountCard store={store} />
      <PlanCard store={store} onChanged={onSaved} />
      <form onSubmit={handleSubmit} className="mt-6">
      <ErrorBanner message={error} />
      <div className="grid gap-6">
        <div className="card space-y-5 p-6">
          <h3 className="text-sm font-semibold text-fg/70">Thông tin cửa hàng</h3>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Tên cửa hàng" error={fieldErrors.name}>
              <input required value={form.name} onChange={set('name')} className="input" />
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
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                <Box size={16} />
              </span>
              <h3 className="text-sm font-semibold text-fg/80">Ngành hàng</h3>
            </div>
            <p className="mb-3 text-xs text-fg/35">
              {IS_PORTAL
                ? 'Đổi ngành hàng sẽ đổi đơn vị tính + cách chia size mặc định theo ngành mới — ảnh hưởng cách bot hiểu size/số lượng khách gõ trong chat.'
                : 'Đổi ngành hàng sẽ đổi đơn vị tính + kiểu biến thể mặc định theo ngành mới — ảnh hưởng cách bot hiểu size/số lượng khách gõ trong chat.'}
            </p>
            {!bizTypes && <p className="text-sm text-fg/40">Đang tải danh sách ngành…</p>}
            {bizTypes && (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {bizTypes.map((t) => (
                  <BizTypeOption
                    key={t.key}
                    label={t.label}
                    active={form.business_type === t.key}
                    onClick={() => requestBusinessType(t)}
                  />
                ))}
              </div>
            )}
            <div className="mt-4">
              <Field label="Đơn vị tính" hint="Vd: đôi, phần, cái, ly, lượt... — đổi theo ngành ở trên, có thể sửa tay">
                <input value={form.unit} onChange={set('unit')} className="input max-w-xs" />
              </Field>
            </div>
          </div>

          <div className="border-t border-fg/[0.06] pt-4">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                <Layers size={16} />
              </span>
              <h3 className="text-sm font-semibold text-fg/80">
                {IS_PORTAL ? 'Cách chia size sản phẩm' : 'Kiểu biến thể sản phẩm'}
              </h3>
            </div>
            <Field
              label={IS_PORTAL ? 'Sản phẩm của bạn chia size kiểu nào?' : 'Kiểu'}
              hint={IS_PORTAL
                ? 'Để bot hiểu đúng khi khách nhắn size trong chat.'
                : 'Để bot hiểu đúng khi khách gõ size/biến thể trong chat — không chỉ giày'}
            >
              {/* value giữ nguyên 3 giá trị 'so'/'nhan'/'khong_co' — backend
                  _validate_variant_config() phụ thuộc đúng 3 giá trị này, chỉ đổi câu chữ. */}
              <select value={form.variant_mode} onChange={set('variant_mode')} className="input">
                <option value="so">
                  {IS_PORTAL ? 'Chia theo size số — vd giày 35, 36… 43' : 'Số trong 1 dải (vd size giày 35–43)'}
                </option>
                <option value="nhan">
                  {IS_PORTAL ? 'Chia theo size chữ — vd S, M, L, XL' : 'Danh sách nhãn tự đặt (vd S, M, L, XL)'}
                </option>
                <option value="khong_co">
                  {IS_PORTAL ? 'Không chia size — chỉ đếm số lượng (vd quán ăn)' : 'Không có biến thể (chỉ số lượng)'}
                </option>
              </select>
            </Field>
            {form.variant_mode === 'so' && (
              <div className="mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label={IS_PORTAL ? 'Size nhỏ nhất' : 'Số nhỏ nhất'}>
                    <input type="number" value={form.variant_min} onChange={set('variant_min')} className="input" />
                  </Field>
                  <Field label={IS_PORTAL ? 'Size lớn nhất' : 'Số lớn nhất'}>
                    <input type="number" value={form.variant_max} onChange={set('variant_max')} className="input" />
                  </Field>
                </div>
                {fieldErrors.variant_range && (
                  <p className="mt-1.5 text-xs text-rose-500">{fieldErrors.variant_range}</p>
                )}
              </div>
            )}
            {form.variant_mode === 'nhan' && (
              <div className="mt-4">
                <Field
                  label={IS_PORTAL ? 'Các size có bán' : 'Danh sách nhãn'}
                  hint="Cách nhau bằng dấu phẩy"
                  error={fieldErrors.variant_labels}
                >
                  <input value={form.variant_labels} onChange={set('variant_labels')} className="input" placeholder="S, M, L, XL" />
                </Field>
              </div>
            )}
          </div>

          <div className="border-t border-fg/[0.06] pt-4">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                <Star size={16} />
              </span>
              <h3 className="text-sm font-semibold text-fg/80">Điểm tích luỹ</h3>
            </div>
            <p className="mb-3 text-xs text-fg/35">
              Để trống cả 2 ô = tắt tích điểm cho cửa hàng này. Khách tự đổi điểm lấy giảm giá
              ngay trong chat (vd "đổi 50 điểm").
            </p>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Chi bao nhiêu được 1 điểm" hint="Vd 10000 = cứ 10.000đ thanh toán được 1 điểm">
                <input type="number" value={form.loyalty_spend_per_point} onChange={set('loyalty_spend_per_point')}
                       className="input" placeholder="Để trống = tắt" />
              </Field>
              <Field label="1 điểm đổi được bao nhiêu tiền" hint="Vd 500 = 1 điểm giảm 500đ khi đổi">
                <input type="number" value={form.loyalty_redeem_rate} onChange={set('loyalty_redeem_rate')}
                       className="input" placeholder="Để trống = tắt" />
              </Field>
            </div>
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

          {/* Portal: ẨN HẲN khối này, không hiện bản "disabled + cảnh báo" — đây là văn bản
              nối thẳng vào system prompt của LLM (commerce/app/assistant.py), viết sai thì
              bot trả lời lệch và không có bản nháp/khôi phục/duyệt lại trong UI để chủ shop
              tự kiểm chứng hậu quả. Những thứ chủ shop thực sự cần chỉnh đã có field riêng dễ
              hiểu hơn ở trên (Ngành hàng, Tone giọng văn, Chính sách trả lời khách).
              LƯU Ý BẢO MẬT: đây CHỈ là ẩn ở UI, KHÔNG phải chặn quyền — PUT
              /api/admin/stores/{sid} vẫn cho tenant_owner sửa custom_prompt trực tiếp qua
              API (field nằm trong _EDITABLE ở backend); chặn thật nằm ngoài phạm vi đợt này. */}
          {!IS_PORTAL && (
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
          )}
          {IS_PORTAL && store.custom_prompt && (
            <div className="border-t border-fg/[0.06] pt-4">
              <p className="text-xs text-fg/40">
                Quản trị viên đã thêm quy tắc riêng cho AI của cửa hàng này.
              </p>
            </div>
          )}

          <button type="submit" disabled={saving} className="btn-primary w-full py-2.5">
            {saving ? 'Đang lưu…' : saved ? 'Đã lưu ✓' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
      </form>
    </div>
  )
}

function BizTypeOption({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ' +
        (active
          ? 'border-indigo-400/50 bg-indigo-500/10 text-fg'
          : 'border-fg/[0.08] bg-fg/[0.02] text-fg/60 hover:bg-fg/[0.04]')
      }
    >
      {label}
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
