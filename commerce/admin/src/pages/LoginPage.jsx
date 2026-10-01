import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingBag } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { EXPECTED_ROLE, OTHER_PREFIX } from '../lib/console'
import ErrorBanner from '../components/ErrorBanner'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const u = await login(email, password)
      if (u.role !== EXPECTED_ROLE) {
        // Đăng nhập đúng tài khoản nhưng đang ở sai cổng (xem AuthGuard) — nhảy nguyên
        // trang sang đúng cổng thay vì hiện lỗi, đỡ phải tự tìm đúng link.
        window.location.replace(OTHER_PREFIX + '/')
        return
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg border-2 border-indigo-800 bg-indigo-700 text-white shadow-[2px_2px_0_var(--color-indigo-800)]">
            <ShoppingBag size={20} />
          </span>
          <h1 className="text-lg font-semibold tracking-tight text-fg">
            {EXPECTED_ROLE === 'super_admin' ? 'Commerce Admin' : 'Cổng quản lý cửa hàng'}
          </h1>
          <p className="mt-1 text-sm text-fg/55">
            {EXPECTED_ROLE === 'super_admin'
              ? 'Đăng nhập để quản lý toàn bộ cửa hàng.'
              : 'Đăng nhập để tự quản lý cửa hàng của bạn.'}
          </p>
        </div>

        <ErrorBanner message={error} />

        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-fg/80">Email</span>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="chuxxx@example.com"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-fg/80">Mật khẩu</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
            />
          </label>
          <button type="submit" disabled={busy} className="btn-primary w-full py-2.5 text-sm">
            {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  )
}
