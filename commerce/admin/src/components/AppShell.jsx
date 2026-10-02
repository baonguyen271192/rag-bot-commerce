import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { KeyRound, LayoutGrid, LogOut, Menu, ShoppingBag, Store, X } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { EXPECTED_ROLE, IS_PORTAL } from '../lib/console'
import { STORE_SECTIONS, storeIdFromPath, storeSectionPath } from '../lib/store-nav'
import StoreSwitcher from './StoreSwitcher'
import ThemeToggle from './ThemeToggle'

// IA sidebar 2 TẦNG ngữ cảnh (đổi từ IA phẳng cũ — xem lịch sử git cho bản trước đó):
//   - Admin, CHƯA chọn cửa hàng: Tổng quan / Cửa hàng.
//   - Admin, ĐANG xem 1 cửa hàng (/stores/:id): KHÔNG có nhóm mục nào thêm — admin chỉ
//     quản lý danh sách cửa hàng + gói dịch vụ (xem StoreLayout.jsx), không xem/sửa được
//     nội dung vận hành của cửa hàng nào cả — kể cả cấu hình KÊNH (Facebook/Zalo) của
//     từng cửa hàng, nên nhóm nav "Kênh" tổng hợp (3 trang /channels/*, từng hiện ở đây)
//     đã GỠ HẲN, không chỉ ẩn: 1 cửa hàng tự quản lý kênh của chính mình (giống chủ nhà
//     cho thuê không tự ý chỉnh nội thất trong nhà người thuê, chỉ thu tiền thuê).
//   - Portal: luôn hiện thẳng 7 mục (Cấu hình/Kênh/Menu/Đơn hàng/Hội thoại/Khách hàng/
//     Khuyến mãi — xem lib/store-nav.js) của ĐÚNG cửa hàng duy nhất của chủ shop, không
//     có mục "Cửa hàng" (danh sách) hay nhóm Kênh tổng hợp.
export default function AppShell({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const path = location.pathname
  const onOverview = path === '/'
  // "Đang ở danh sách Cửa hàng" chỉ còn tính /stores và /stores/new — /stores/:id/* giờ
  // có nhóm nav RIÊNG của chính cửa hàng đó, không còn làm sáng mục "Cửa hàng" nữa.
  const onStoreList = path === '/stores' || path === '/stores/new'

  // Sidebar biến mất hoàn toàn dưới breakpoint sm (không gian quá hẹp cho 256px cố
  // định) — trên mobile thay bằng drawer trượt ra, mở/đóng qua nút hamburger, tự đóng
  // mỗi khi đổi route để không bị che màn hình sau khi bấm 1 mục điều hướng.
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  useEffect(() => {
    setMobileNavOpen(false)
  }, [path])

  // Danh sách cửa hàng cho StoreSwitcher + đếm badge "Cửa hàng" — dùng đúng
  // GET /api/admin/stores đã có, không thêm API mới, không gọi 2 lần. Lỗi tải thì thôi,
  // chỉ ẩn badge/hiện placeholder — sidebar không phải chỗ hiện ErrorBanner.
  const [stores, setStores] = useState(null)
  function loadStores() {
    api.listStores().then(setStores).catch(() => setStores([]))
  }
  useEffect(loadStores, [])
  // Danh sách switcher là bản chụp lúc tải trang, KHÔNG polling — chỉ nạp lại khi điều
  // hướng về "/" hoặc "/stores" (2 trang mà luồng tạo/xoá cửa hàng luôn quay về), để sau
  // khi tạo/xoá xong, lần tới mở switcher thấy đúng danh sách mới.
  useEffect(() => {
    if (path === '/' || path === '/stores') loadStores()
  }, [path])

  // Cửa hàng đang xem: từ URL (/stores/:id/*) — admin KHÔNG tự suy ra cửa hàng nào cả
  // khi chưa có trong URL; portal CHỈ có đúng 1 cửa hàng nên tự chọn nó ngay khi danh
  // sách tải xong (chủ shop không cần/không có bước "chọn cửa hàng").
  const activeStoreId = storeIdFromPath(path) ?? (IS_PORTAL ? stores?.[0]?.id ?? null : null)
  const activeStore = stores?.find((s) => s.id === activeStoreId) ?? null
  const showStoreNav = Boolean(activeStoreId)

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
          <StoreSwitcher stores={stores} activeStoreId={activeStoreId} onNavigate={() => setMobileNavOpen(false)} />

          <NavLabel>Tổng quan</NavLabel>
          <NavItem to="/" icon={LayoutGrid} active={onOverview}>
            Tổng quan
          </NavItem>
          {/* Portal vào thẳng 6 mục của cửa hàng mình, không cần mục "Cửa hàng" (danh
              sách) — chủ shop chỉ có đúng 1 cửa hàng, danh sách không có gì để chọn. */}
          {!IS_PORTAL && (
            <NavItem
              to={EXPECTED_ROLE === 'super_admin' || !stores?.length ? '/stores' : `/stores/${stores[0].id}`}
              icon={Store}
              active={onStoreList}
            >
              Cửa hàng
              {stores && <NavBadge>{stores.length}</NavBadge>}
            </NavItem>
          )}

          {/* Nhóm các mục NỘI DUNG VẬN HÀNH của cửa hàng đang xem — CHỈ portal. Mô hình
              phân quyền đã chốt (BA/PO, xem app/auth.py require_tenant_owner_store_access):
              super_admin không xem/sửa được config bot, kênh, menu, đơn hàng, khách hàng,
              khuyến mãi, hội thoại của BẤT KỲ cửa hàng nào — chỉ quản lý danh sách cửa
              hàng + gói dịch vụ (xem StoreLayout.jsx, khối OwnerAccountCard/PlanCard thay
              cho <Outlet> khi admin xem 1 cửa hàng) — nên không hiện mục nào ở đây dẫn tới
              403 cho admin nữa. */}
          {showStoreNav && IS_PORTAL && (
            <>
              <NavLabel>
                <span className="block truncate" title={activeStore?.name}>
                  {activeStore?.name || 'Cửa hàng'}
                </span>
              </NavLabel>
              {STORE_SECTIONS.map((s) => {
                const to = storeSectionPath(activeStoreId, s.key)
                return (
                  <NavItem key={s.key} to={to} icon={s.icon} active={path === to}>
                    {s.label}
                  </NavItem>
                )
              })}
            </>
          )}
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

// Chỉ còn 1 nơi gọi (badge số lượng "Cửa hàng"), nên bỏ luôn tham số `tone` — các badge
// trạng thái/active-tổng theo kênh (BADGE_TONE_CLASS) đã gỡ cùng nhóm nav "Kênh".
function NavBadge({ title, children }) {
  return (
    <span
      title={title}
      className="ml-auto rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-indigo-600 dark:text-indigo-200"
    >
      {children}
    </span>
  )
}
