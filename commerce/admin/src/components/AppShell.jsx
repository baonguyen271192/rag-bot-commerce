import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, LayoutGrid, MessageCircle, Send, ShoppingBag, Store } from 'lucide-react'
import { api } from '../lib/api'
import { BADGE_TONE_CLASS, badgeTone, channelCounts } from '../lib/channels'
import ThemeToggle from './ThemeToggle'

// IA sidebar 2 nhóm — "Tổng quan" (Tổng quan/Cửa hàng, route hiện có) và "Kênh"
// (Facebook + Zalo cá nhân/OA, route mới). Xem docs/channels-ia-mockup.html — nguồn
// thiết kế đã duyệt cho cấu trúc/nhãn/badge dưới đây.
export default function AppShell({ children }) {
  const location = useLocation()
  const path = location.pathname
  const onList = path === '/'
  const onFacebook = path === '/channels/facebook'
  const onZaloPersonal = path === '/channels/zalo-personal'
  const onZaloOa = path === '/channels/zalo-oa'
  const onZaloChild = onZaloPersonal || onZaloOa

  const [zaloOpen, setZaloOpen] = useState(onZaloChild)
  useEffect(() => {
    if (onZaloChild) setZaloOpen(true)
  }, [onZaloChild])

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
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-surface2/80 px-4 py-6 backdrop-blur-xl sm:flex">
        <Link to="/" className="mb-6 flex items-center gap-2.5 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/30">
            <ShoppingBag size={18} />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-fg">Commerce Admin</div>
            <div className="text-xs text-fg/55">Quản lý bot đa cửa hàng</div>
          </div>
        </Link>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          <NavLabel>Tổng quan</NavLabel>
          <NavItem to="/" icon={LayoutGrid} active={onList}>
            Tổng quan
          </NavItem>
          <NavItem to="/" icon={Store} active={onList}>
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
          <div className="flex items-center gap-2 rounded-lg border border-line bg-fg/[0.02] px-3 py-2.5 text-xs text-fg/50">
            <Store size={14} className="shrink-0" />
            Bot đặt đơn đa cửa hàng, đa ngành
          </div>
        </div>
      </aside>

      <div className="flex-1 sm:pl-64">
        <main className="mx-auto max-w-5xl px-6 py-8 sm:px-10">{children}</main>
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
        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ' +
        (active ? 'bg-fg/[0.06] text-fg' : 'text-fg/60 hover:bg-fg/[0.04] hover:text-fg/90')
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
