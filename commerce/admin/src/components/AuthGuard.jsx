import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { EXPECTED_ROLE, OTHER_PREFIX } from '../lib/console'

export default function AuthGuard({ children }) {
  const { user, checking } = useAuth()

  if (checking) return null
  // Không giữ "quay lại trang vừa xem" qua location.state — logout rồi đăng nhập lại
  // bằng tài khoản KHÁC (tenant khác) có thể kế thừa state.from trỏ tới trang cũ không
  // thuộc tenant mới, dẫn tới redirect nhầm sang cửa hàng của người khác. Luôn về "/"
  // đơn giản và an toàn hơn.
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== EXPECTED_ROLE) {
    // Đăng nhập đúng nhưng SAI CỔNG (vd chủ shop bấm nhầm link /admin, hoặc super admin
    // mở /portal) — 2 cổng dùng basename khác nhau nên không thể điều hướng nội bộ bằng
    // react-router, phải nhảy nguyên trang sang đúng cổng.
    window.location.replace(OTHER_PREFIX + '/')
    return null
  }
  return children
}
