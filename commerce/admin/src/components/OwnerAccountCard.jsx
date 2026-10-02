import { useState } from 'react'
import { Eye, EyeOff, KeyRound, UserRound } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { IS_PORTAL } from '../lib/console'
import ErrorBanner from './ErrorBanner'

// Tài khoản đăng nhập cổng tự phục vụ (/portal) của chủ cửa hàng. Dùng chung cho cả
// StoreConfigPage (chủ cửa hàng xem email của chính mình) và view tóm tắt admin xem
// (admin_reset_owner_password vẫn require_super_admin — KHÔNG đổi, support đặt lại mật
// khẩu hộ chủ shop quên mật khẩu vẫn thuộc phạm vi "quản lý cửa hàng" admin được làm,
// khác với sửa NỘI DUNG vận hành như config bot/đơn hàng/menu).
export default function OwnerAccountCard({ store }) {
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
                {IS_PORTAL ? (
                  'Email bạn dùng để đăng nhập.'
                ) : (
                  <>Đăng nhập tại cổng tự phục vụ (<code className="text-fg/60">/portal</code>) bằng email này.</>
                )}
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
                          className="input w-56 pr-11 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((s) => !s)}
                          aria-label={showPassword ? 'Ẩn' : 'Hiện'}
                          className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-fg/40 hover:text-fg/70"
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
