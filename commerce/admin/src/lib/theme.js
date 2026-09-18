// Quản lý theme sáng/tối: nguồn sự thật là thuộc tính data-theme trên <html>
// + localStorage. index.html có một đoạn script inline làm lại việc "đọc rồi set"
// này SỚM HƠN (trước khi CSS áp dụng) để tránh nháy màu — file này là bản đầy đủ,
// dùng bởi useTheme() (App React) sau khi đã hydrate.
const STORAGE_KEY = 'commerce-admin-theme'

export function getStoredTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null // localStorage có thể bị chặn (private mode, sandbox…)
  }
}

export function getSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function getCurrentTheme() {
  if (typeof document === 'undefined') return 'dark'
  const attr = document.documentElement.getAttribute('data-theme')
  return attr === 'light' || attr === 'dark' ? attr : getStoredTheme() || getSystemTheme()
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // ignore — không lưu được thì lần sau lại theo prefers-color-scheme, không crash
  }
}
