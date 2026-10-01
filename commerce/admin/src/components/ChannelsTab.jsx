import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  Info,
  Lock,
  MessageCircle,
  QrCode,
  Send,
  Smartphone,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import ErrorBanner from './ErrorBanner'

// Trang cấu hình kênh cho 1 cửa hàng. Mỗi loại kênh là 1 thẻ độc lập, tự giữ form
// và tự gọi PUT/DELETE /api/admin/stores/{id}/channels/{ctype}. Sau mỗi lần lưu
// gọi onChanged() để StoreDetailPage nạp lại store (badge kết nối, zalo_enabled…).
export default function ChannelsTab({ store, onChanged }) {
  const ch = store.channels || {}
  return (
    // max-w-[1100px] — như tab Cấu hình: khung ngoài (AppShell) rộng 1600px để bảng dữ
    // liệu dùng hết chỗ, nhưng thẻ bật/tắt kênh chỉ có vài input ngắn (Page ID, token)
    // nên cần tự giới hạn, không thì input/nút "Lưu" kéo giãn hết cỡ, rất xấu.
    <div className="max-w-[1100px] mx-auto space-y-5">
      <FacebookChannel store={store} data={ch.facebook || {}} onChanged={onChanged} />
      <ZaloPersonalChannel store={store} data={ch.zalo_personal || {}} onChanged={onChanged} />
      <ZaloOaChannel store={store} data={ch.zalo_oa || {}} onChanged={onChanged} />
    </div>
  )
}

// ── Facebook Messenger ────────────────────────────────────────────────────────
function FacebookChannel({ store, data, onChanged }) {
  const [form, setForm] = useState({
    page_id: data.page_id || '',
    page_token: '',
  })
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const save = useChannelSave(store.id, 'facebook', onChanged)

  return (
    <ChannelCard
      icon={Send}
      color="blue"
      title="Facebook Messenger"
      subtitle="Trả lời khách nhắn tin qua Fanpage"
      enabled={data.enabled}
      connected={data.connected}
      onToggle={(enabled) => save.run({ enabled })}
      busy={save.busy}
      onDisconnect={() => save.disconnect()}
      canDisconnect={Boolean(data.page_id || data.has_page_token)}
    >
      <ErrorBanner message={save.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Facebook Page ID">
          <input value={form.page_id} onChange={set('page_id')} className="input" placeholder="110194…" />
        </Field>
        <Field label="Page Access Token">
          <SecretInput
            value={form.page_token}
            onChange={set('page_token')}
            placeholder={data.has_page_token ? '••••••••' : 'EAAG…'}
          />
        </Field>
      </div>
      <SecretHint hasSecret={data.has_page_token} what="token" />
      <SaveButton
        busy={save.busy}
        saved={save.saved}
        onClick={() => {
          const patch = { page_id: form.page_id }
          if (form.page_token) patch.page_token = form.page_token
          save.run(patch).then(() => setForm((f) => ({ ...f, page_token: '' })))
        }}
      />
    </ChannelCard>
  )
}

// ── Zalo cá nhân (qua sidecar zalo-bridge) ────────────────────────────────────
function ZaloPersonalChannel({ store, data, onChanged }) {
  const save = useChannelSave(store.id, 'zalo_personal', onChanged)
  const { user } = useAuth()
  const navigate = useNavigate()
  // plan_features rỗng (store cũ chưa qua tenant provisioning, hoặc field thiếu) coi
  // như CHƯA có — chỉ mở khoá khi backend xác nhận rõ ràng gói hiện tại bao gồm kênh
  // này (backend vẫn là nơi chặn thật qua require_feature(), đây chỉ là UX gợi ý sớm).
  const locked = !(store.plan_features || []).includes('zalo_personal')

  if (locked) {
    // Hành động thật (P1-2, phụ thuộc P0-3 + Q5) thay cho text chết cũ:
    //   - super_admin (Q4: người DUY NHẤT đổi được gói) -> nút điều hướng thẳng tới khối
    //     đổi gói ở tab Cấu hình (đổi query param tab=config), không gọi API ở đây.
    //   - tenant_owner -> không tự đổi được, hiện hướng dẫn TĨNH (Q5-b: chưa có email hỗ
    //     trợ thật, không phải link/mailto bấm được).
    return (
      <div className="card p-6 opacity-90">
        <div className="flex items-start gap-3">
          <span className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ' + COLORS.sky}>
            <Smartphone size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-fg">Zalo cá nhân</h3>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                <Lock size={11} />
                Gói {store.plan_label} chưa bao gồm
              </span>
            </div>
            <p className="mt-0.5 text-xs text-fg/45">Dùng tài khoản Zalo cá nhân qua bridge riêng</p>
            <p className="mt-3 text-sm text-fg/60">
              Kênh này chỉ dùng được ở gói <strong>Pro</strong> trở lên.
            </p>
            {user?.role === 'super_admin' ? (
              <button
                type="button"
                onClick={() => navigate(`/stores/${store.id}?tab=config`)}
                className="btn-primary mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs"
              >
                Đổi gói cho cửa hàng này
                <ArrowRight size={13} />
              </button>
            ) : (
              <p className="mt-2 text-sm font-medium text-fg/70">Liên hệ quản trị viên để nâng cấp gói.</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <ChannelCard
      icon={Smartphone}
      color="sky"
      title="Zalo cá nhân"
      subtitle="Dùng tài khoản Zalo cá nhân qua bridge riêng"
      enabled={data.enabled}
      connected={data.connected}
      connectedLabel="Đã bật kênh"
      onToggle={(enabled) => save.run({ enabled })}
      busy={save.busy}
    >
      <ErrorBanner message={save.error} />
      <InfoNote icon={QrCode}>
        Đăng nhập Zalo (quét QR) và phiên đăng nhập nằm ở service <code className="text-sky-700 dark:text-sky-300">zalo-bridge</code>,
        không lưu tại đây. Bật kênh xong cần <strong>khởi động lại zalo-bridge</strong> để nó mở phiên cho cửa hàng
        này — bridge chỉ dò danh sách cửa hàng một lần lúc chạy.
      </InfoNote>
      <InfoNote icon={Info} tone="muted">
        Trang quét QR trong admin chưa làm — hiện xem QR trực tiếp ở endpoint của bridge.
      </InfoNote>
    </ChannelCard>
  )
}

// ── Zalo OA (khung — chưa có tài liệu chính thức) ─────────────────────────────
function ZaloOaChannel({ store, data, onChanged }) {
  const [form, setForm] = useState({
    oa_id: data.oa_id || '',
    app_secret: '',
    oa_access_token: '',
    oa_refresh_token: '',
  })
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const save = useChannelSave(store.id, 'zalo_oa', onChanged)

  return (
    <ChannelCard
      icon={MessageCircle}
      color="amber"
      title="Zalo OA (Official Account)"
      subtitle="Kênh OA chính thức — đang chờ tài liệu API"
      enabled={data.enabled}
      connected={data.connected}
      onToggle={(enabled) => save.run({ enabled })}
      busy={save.busy}
      onDisconnect={() => save.disconnect()}
      canDisconnect={Boolean(data.oa_id || data.has_oa_access_token)}
    >
      <ErrorBanner message={save.error} />
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <span>
          <strong>Chưa xác minh:</strong> tên các trường bên dưới là tạm đặt, chưa khớp API Zalo OA thật.
          Webhook OA hiện chỉ định tuyến rồi bỏ qua, chưa trả lời. Đừng dùng ở production tới khi có tài liệu chính thức.
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="OA ID">
          <input value={form.oa_id} onChange={set('oa_id')} className="input" placeholder="OA id…" />
        </Field>
        <Field label="App Secret">
          <SecretInput value={form.app_secret} onChange={set('app_secret')}
            placeholder={data.has_app_secret ? '••••••••' : ''} />
        </Field>
        <Field label="OA Access Token">
          <SecretInput value={form.oa_access_token} onChange={set('oa_access_token')}
            placeholder={data.has_oa_access_token ? '••••••••' : ''} />
        </Field>
        <Field label="OA Refresh Token">
          <SecretInput value={form.oa_refresh_token} onChange={set('oa_refresh_token')}
            placeholder={data.has_oa_refresh_token ? '••••••••' : ''} />
        </Field>
      </div>
      <SecretHint hasSecret={data.has_oa_access_token} what="token" />
      <SaveButton
        busy={save.busy}
        saved={save.saved}
        onClick={() => {
          const patch = { oa_id: form.oa_id }
          for (const k of ['app_secret', 'oa_access_token', 'oa_refresh_token']) {
            if (form[k]) patch[k] = form[k]
          }
          save.run(patch).then(() =>
            setForm((f) => ({ ...f, app_secret: '', oa_access_token: '', oa_refresh_token: '' }))
          )
        }}
      />
    </ChannelCard>
  )
}

// ── Shared shell ──────────────────────────────────────────────────────────────
const COLORS = {
  blue: 'bg-blue-500/15 text-blue-400',
  sky: 'bg-sky-500/15 text-sky-400',
  amber: 'bg-amber-500/15 text-amber-400',
}

function ChannelCard({
  icon: Icon, color, title, subtitle, enabled, connected, connectedLabel,
  onToggle, busy, onDisconnect, canDisconnect, children,
}) {
  return (
    <div className={'card p-6 transition-opacity ' + (enabled ? '' : 'opacity-75')}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ' + COLORS[color]}>
            <Icon size={18} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-fg">{title}</h3>
              <StatusDot connected={connected} label={connectedLabel} />
            </div>
            <p className="mt-0.5 text-xs text-fg/45">{subtitle}</p>
          </div>
        </div>
        <Toggle
          checked={Boolean(enabled)}
          disabled={busy}
          onChange={onToggle}
          label={(enabled ? 'Tắt' : 'Bật') + ' kênh ' + title}
        />
      </div>

      {enabled && <div className="mt-5 border-t border-fg/[0.06] pt-5">{children}</div>}

      {enabled && onDisconnect && canDisconnect && (
        <button
          onClick={onDisconnect}
          disabled={busy}
          className="mt-4 text-xs font-medium text-fg/35 transition-colors hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-50"
        >
          Ngắt kết nối &amp; xoá thông tin kênh này
        </button>
      )}
    </div>
  )
}

function StatusDot({ connected, label }) {
  const text = connected ? label || 'Đã kết nối' : 'Chưa kết nối'
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ' +
        (connected ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-fg/[0.06] text-fg/40')
      }
    >
      <span className={'h-1.5 w-1.5 rounded-full ' + (connected ? 'bg-emerald-400' : 'bg-fg/30')} />
      {text}
    </span>
  )
}

function Toggle({ checked, disabled, onChange, label }) {
  // Vùng chạm 44×44 (chuẩn touch target) bọc quanh pill nhỏ 24px bên trong.
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-50"
      style={{ touchAction: 'manipulation' }}
    >
      <span
        className={
          'relative block h-6 w-11 rounded-full transition-colors ' +
          (checked ? 'bg-indigo-500' : 'bg-fg/15')
        }
      >
        <span
          className={
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ' +
            (checked ? 'translate-x-[22px]' : 'translate-x-0.5')
          }
        />
      </span>
    </button>
  )
}

function SaveButton({ busy, saved, onClick }) {
  return (
    <button onClick={onClick} disabled={busy} className="btn-primary mt-5 w-full py-2.5 text-sm">
      {busy ? 'Đang lưu…' : saved ? 'Đã lưu ✓' : 'Lưu thông tin kênh'}
    </button>
  )
}

function SecretHint({ hasSecret, what }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-fg/35">
      <Lock size={12} className="mt-0.5 shrink-0" />
      {hasSecret
        ? `Đã có ${what} — để trống nếu không muốn đổi.`
        : `Chưa có ${what} — kênh chưa gửi được tin cho tới khi điền.`}
    </p>
  )
}

function InfoNote({ icon: Icon, children, tone }) {
  const cls =
    tone === 'muted'
      ? 'border-fg/[0.06] bg-fg/[0.02] text-fg/45'
      : 'border-sky-500/20 bg-sky-500/[0.08] text-sky-700 dark:text-sky-200/90'
  return (
    <div className={'mt-3 flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-xs ' + cls}>
      <Icon size={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-fg/80">{label}</span>
      {children}
    </label>
  )
}

// Ô nhập secret có nút ẩn/hiện — để admin kiểm lại token vừa dán mà vẫn mặc định che.
function SecretInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        value={value}
        onChange={onChange}
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        className="input pr-11"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Ẩn' : 'Hiện'}
        className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-fg/40 transition-colors hover:text-fg/70"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}

// Gom logic gọi API + trạng thái busy/saved/error dùng chung cho mọi kênh.
function useChannelSave(storeId, ctype, onChanged) {
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function run(patch) {
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      await api.setChannel(storeId, ctype, patch)
      setSaved(true)
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    if (!window.confirm('Ngắt kết nối và xoá thông tin kênh này?')) return
    setBusy(true)
    setError('')
    try {
      await api.removeChannel(storeId, ctype)
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return { busy, saved, error, run, disconnect }
}
