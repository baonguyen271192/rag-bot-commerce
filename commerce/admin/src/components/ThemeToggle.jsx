import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { applyTheme, getCurrentTheme } from '../lib/theme'

// Nút chuyển theme sáng/tối — đặt trong AppShell. Đọc theme hiện tại từ
// document.documentElement (đã được set sớm bởi script inline trong index.html),
// bấm là đổi ngay + lưu localStorage (xem lib/theme.js).
export default function ThemeToggle() {
  const [theme, setTheme] = useState(getCurrentTheme)

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
      className="mb-2 flex w-full items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-xs font-medium text-fg2 transition-colors hover:bg-fg/[0.04] hover:text-fg"
    >
      {isDark ? <Sun size={14} className="shrink-0" /> : <Moon size={14} className="shrink-0" />}
      {isDark ? 'Giao diện sáng' : 'Giao diện tối'}
    </button>
  )
}
