import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, KeyRound, LayoutGrid, LogOut, Menu, MessageCircle, Send, ShoppingBag, Store, X } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { EXPECTED_ROLE } from '../lib/console'
import { BADGE_TONE_CLASS, badgeTone, channelCounts } from '../lib/channels'
import ThemeToggle from './ThemeToggle'

// IA sidebar 2 nhóm — "Tổng quan" (Tổng quan: digest cần xử lý ở "/", Cửa hàng: danh
// sách quản lý ở "/stores") và "Kênh" (Facebook + Zalo cá nhân/OA). Xem
// docs/channels-ia-mockup.html — nguồn thiết kế đã duyệt cho cấu trúc/nhãn/badge dưới đây.
export default function AppShell({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const path = location.pathname
  const onOverview = path === '/'
  const onStoreList = path === '/stores'
  const onFacebook = path === '/channels/facebook'
  const onZaloPersonal = path === '/channels/zalo-personal'
  const onZaloOa = path === '/channels/zalo-oa'
  const onZaloChild = onZaloPersonal || onZaloOa

  const [zaloOpen, setZaloOpen] = useState(onZaloChild)
  useEffect(() => {
    if (onZaloChild) setZaloOpen(true)
  }, [onZaloChild])

  // Sidebar biến mất hoàn toàn dưới breakpoint sm (không gian quá hẹp cho 256px cố
  // định) — trên mobile thay bằng drawer trượt ra, mở/đóng qua nút hamburger, tự đóng
  // mỗi khi đổi route để không bị che màn hình sau khi bấm 1 mục điều hướng.
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  useEffect(() => {
    setMobileNavOpen(false)
  }, [path])

  // Badge [active]/[tổng cửa hàng] cho từng kênh — dùng đúng GET /api/admin/stores đã
  // có (mỗi store summary có channels.{facebook,zalo_personal,zalo_oa}), không thêm
  // API mới. Lỗi tải thì thôi, chỉ ẩn badge — sidebar không phải chỗ hiện ErrorBanner.
  const [stores, setStores] = useState(null)
  useEffect(() => {
    api.listStores().then(setStores).catch(() => setStores([]))
  }, [])

  const fb = channelCounts(stores, 'facebook')
  const zca = channelCounts(stores, 'zalo_personal')
  const oa = channelCounts(stores, 'zalo_oa')

  return (
    <div className="flex min-h-screen">
      {/* Backdrop — chỉ hiện khi drawer mobile đang mở (sm:hidden ẩn hẳn từ breakpoint
          sm trở lên, nơi sidebar đã luôn hiện cố định, không cần lớp phủ). */}
      {mobileNavOpen && (
        <div
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-black/50 sm:hidden"
        />
      )}
      <aside
        className={
          'fixed inset-y-0 left-0 z-50 w-64 flex-col border-r border-line bg-surface2/80 px-4 py-6 backdrop-blur-xl ' +
          'transition-transform duration-200 ease-out sm:flex sm:translate-x-0 ' +
          (mobileNavOpen ? 'flex translate-x-0' : 'hidden -translate-x-full')
        }
      >
        <div className="mb-6 flex items-center justify-between px-2">
          <Link to="/" className="flex items-center gap-2.5" onClick={() => setMobileNavOpen(false)}>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-indigo-800 bg-indigo-700 text-white shadow-[2px_2px_0_var(--color-indigo-800)]">
              <ShoppingBag size={18} />
            </span>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-fg">
                {EXPECTED_ROLE === 'super_admin' ? 'Commerce Admin' : 'Cổng quản lý cửa hàng'}
              </div>
              <div className="text-xs text-fg/55">
                {EXPECTED_ROLE === 'super_admin' ? 'Quản lý bot đa cửa hàng' : 'Dành cho chủ cửa hàng'}
              </div>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Đóng menu"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fg/50 hover:bg-fg/[0.06] sm:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          <NavLabel>Tổng quan</NavLabel>
          <NavItem to="/" icon={LayoutGrid} active={onOverview}>
            Tổng quan
          </NavItem>
          <NavItem to="/stores" icon={Store} active={onStoreList}>
            Cửa hàng
            {stores && <NavBadge tone="default">{stores.length}</NavBadge>}
          </NavItem>

          <NavLabel>Kênh</NavLabel>
          <NavItem to="/channels/facebook" icon={Send} active={onFacebook}>
            Facebook
            {stores && (
              <NavBadge tone={badgeTone(fb.active, fb.total)} title={`${fb.active} đã kết nối / ${fb.total} cửa hàng`}>
                {fb.active}/{fb.total}
              </NavBadge>
            )}
          </NavItem>

          <div>
            <button
              type="button"
              onClick={() => setZaloOpen((o) => !o)}
              aria-expanded={zaloOpen}
              className={
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ' +
                (onZaloChild ? 'bg-fg/[0.06] text-fg' : 'text-fg/60 hover:bg-fg/[0.04] hover:text-fg/90')
              }
            >
              <MessageCircle size={16} />
              Zalo
              <ChevronRight
                size={15}
                className={'ml-auto transition-transform ' + (zaloOpen ? 'rotate-90' : '')}
              />
            </button>
            {zaloOpen && (
              <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-line pl-3">
                <SubNavItem to="/channels/zalo-personal" active={onZaloPersonal}>
                  Zalo cá nhân
                  {stores && (
                    <NavBadge
                      tone={badgeTone(zca.active, zca.total)}
                      title={`${zca.active} phiên đang chạy / ${zca.total} cửa hàng`}
                    >
                      {zca.active}/{zca.total}
                    </NavBadge>
                  )}
                </SubNavItem>
                <SubNavItem to="/channels/zalo-oa" active={onZaloOa}>
                  Zalo OA
                  {stores && (
                    <NavBadge
                      tone={badgeTone(oa.active, oa.total)}
                      title={`${oa.active} đã kết nối / ${oa.total} cửa hàng · đang Beta`}
                    >
                      {oa.active}/{oa.total}
                    </NavBadge>
                  )}
                </SubNavItem>
              </div>
            )}
          </div>
        </nav>

        <div className="mt-auto pt-3">
          <ThemeToggle />
          {user && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-fg/[0.02] px-3 py-2.5 text-xs">
              <span className="min-w-0 flex-1 truncate text-fg/60" title={user.email}>
                {user.email}
                <span className="ml-1.5 text-fg/35">
                  · {user.role === 'super_admin' ? 'Super admin' : 'Chủ cửa hàng'}
                </span>
              </span>
              <Link
                to="/account"
                aria-label="Đổi mật khẩu"
                title="Đổi mật khẩu"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg/40 transition-colors hover:bg-fg/[0.06] hover:text-fg/80"
              >
                <KeyRound size={14} />
              </Link>
              <button
                type="button"
                onClick={() => logout().then(() => navigate('/login'))}
                aria-label="Đăng xuất"
                title="Đăng xuất"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg/40 transition-colors hover:bg-fg/[0.06] hover:text-fg/80"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* min-w-0 — flex item mặc định min-width:auto, nghĩa là nó KHÔNG co nhỏ hơn
          nội dung con (vd bảng StoreTable có min-w-[720px]), ép cả layout tràn ngang
          thay vì chỉ cuộn ngang bên trong .overflow-x-auto của riêng bảng đó. */}
      <div className="min-w-0 flex-1 sm:pl-64">
        {/* Thanh mobile — thay chỗ sidebar (ẩn hẳn dưới sm) để vẫn có đường vào menu.
            Không fixed/sticky để khỏi phải tính padding-top bù — nằm trong flow bình
            thường, tự đẩy <main> xuống dưới nó. */}
        <div className="flex items-center justify-between border-b border-line bg-surface2/80 px-4 py-3 backdrop-blur-xl sm:hidden">
          <span className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md border-2 border-indigo-800 bg-indigo-700 text-white">
              <ShoppingBag size={14} />
            </span>
            <span className="text-sm font-semibold text-fg">
              {EXPECTED_ROLE === 'super_admin' ? 'Commerce Admin' : 'Cổng quản lý cửa hàng'}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Mở menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-fg/60 hover:bg-fg/[0.06]"
          >
            <Menu size={20} />
          </button>
        </div>
        {/* max-w-5xl (1024px) cũ để trống rất nhiều 2 bên trên màn hình rộng — bảng dữ
            liệu (StoreTable, 3 trang Kênh) và grid StatCard đều hưởng lợi khi có nhiều
            chỗ ngang hơn. Form hẹp cần đọc dễ (CreateStorePage, tab Cấu hình) tự đặt
            max-width RIÊNG bên trong thay vì dựa vào khung ngoài này. */}
        <main className="mx-auto max-w-[1600px] px-6 py-8 sm:px-10">{children}</main>
      </div>
    </div>
  )
}

function NavLabel({ children }) {
  return (
    <div className="px-3 pb-1.5 pt-3.5 text-[10.5px] font-semibold uppercase tracking-wider text-fg3 first:pt-0">
      {children}
    </div>
  )
}

function NavItem({ to, icon: Icon, active, children }) {
  return (
    <Link
      to={to}
      className={
        'flex items-center gap-2.5 rounded-r-lg border-l-[3px] px-3 py-2 text-sm font-medium transition-colors ' +
        (active
          ? 'border-indigo-600 bg-indigo-500/10 text-fg'
          : 'border-transparent text-fg/60 hover:bg-fg/[0.04] hover:text-fg/90')
      }
    >
      <Icon size={16} className="shrink-0" />
      {children}
    </Link>
  )
}

function SubNavItem({ to, active, children }) {
  return (
    <Link
      to={to}
      className={
        'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors ' +
        (active ? 'bg-fg/[0.06] text-fg' : 'text-fg/60 hover:bg-fg/[0.04] hover:text-fg/90')
      }
    >
      <span className={'h-1.5 w-1.5 rounded-full bg-current ' + (active ? 'opacity-100' : 'opacity-50')} />
      {children}
    </Link>
  )
}

function NavBadge({ tone, title, children }) {
  const cls = tone === 'default' ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-200' : BADGE_TONE_CLASS[tone]
  return (
    <span
      title={title}
      className={'ml-auto rounded-full px-2 py-0.5 text-[10.5px] font-semibold tabular-nums ' + cls}
    >
      {children}
    </span>
  )
}
