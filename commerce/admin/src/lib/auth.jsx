import { createContext, useContext, useEffect, useState } from 'react'
import { api } from './api'

const AuthContext = createContext(null)

// `user` = null trong lúc đang kiểm tra phiên lúc mount (khác hẳn "đã kiểm xong, chưa
// đăng nhập" — AuthGuard cần phân biệt 2 trạng thái này để không nháy redirect /login
// rồi lại nháy vào trang chính ngay khi cookie hợp lệ được xác nhận).
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    api.me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setChecking(false))
  }, [])

  async function login(email, password) {
    const u = await api.login(email, password)
    setUser(u)
    return u
  }

  async function logout() {
    await api.logout().catch(() => {})
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, checking, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth() phải dùng trong <AuthProvider>')
  return ctx
}
