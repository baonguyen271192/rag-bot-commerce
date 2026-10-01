import { useState } from 'react'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { api } from '../lib/api'
import ErrorBanner from '../components/ErrorBanner'

// Đổi mật khẩu tự phục vụ (P1-4) — cho MỌI role đã đăng nhập (super_admin lẫn
// tenant_owner). Chưa có component menu tài khoản/trang Settings sẵn có trong admin UI
// (đã xác minh App.jsx/AppShell.jsx) nên đặt thành 1 trang riêng ở route /account, liên
// kết từ khối user ở cuối sidebar (xem AppShell.jsx) — khác `OwnerAccountCard` ở
// StoreDetailPage (đó là super_admin ĐẶT HỘ mật khẩu cho chủ shop khác, không cần mật
// khẩu cũ); ở đây BẮT BUỘC nhập đúng mật khẩu hiện tại trước khi đổi.
export default function AccountPage() {
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setFieldError('')
    setDone(false)
    if (newPw.length < 6) {
      setFieldError('Mật khẩu mới cần ít nhất 6 ký tự.')
      return
    }
    if (newPw !== confirmPw) {
      setFieldError('Mật khẩu mới và xác nhận không khớp.')
      return
    }
    setBusy(true)
    try {
      await api.changePassword(oldPw, newPw)
      setDone(true)
      setOldPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
          <KeyRound size={18} />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">Đổi mật khẩu</h1>
          <p className="text-sm text-fg/45">Áp dụng cho tài khoản đang đăng nhập.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4 p-6">
        <ErrorBanner message={error} />
        {fieldError && <p className="text-xs text-rose-500">{fieldError}</p>}
        {done && <p className="text-xs text-emerald-700 dark:text-emerald-400">Đã đổi mật khẩu ✓</p>}

        <Field label="Mật khẩu hiện tại">
          <PasswordInput value={oldPw} onChange={setOldPw} show={showOld} onToggle={() => setShowOld((s) => !s)} />
        </Field>
        <Field label="Mật khẩu mới" hint="Ít nhất 6 ký tự">
          <PasswordInput value={newPw} onChange={setNewPw} show={showNew} onToggle={() => setShowNew((s) => !s)} />
        </Field>
        <Field label="Xác nhận mật khẩu mới">
          <PasswordInput value={confirmPw} onChange={setConfirmPw} show={showNew} onToggle={() => setShowNew((s) => !s)} />
        </Field>

        <button type="submit" disabled={busy} className="btn-primary w-full py-2.5">
          {busy ? 'Đang lưu…' : 'Đổi mật khẩu'}
        </button>
      </form>
    </div>
  )
}

function PasswordInput({ value, onChange, show, onToggle }) {
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input pr-11"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? 'Ẩn' : 'Hiện'}
        className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-fg/40 transition-colors hover:text-fg/70"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
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
