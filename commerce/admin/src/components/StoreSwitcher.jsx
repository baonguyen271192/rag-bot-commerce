import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Check, ChevronRight, Search } from 'lucide-react'
import { IS_PORTAL } from '../lib/console'
import { isStoreSection, storeSectionPath, DEFAULT_STORE_SECTION } from '../lib/store-nav'

// Ngưỡng cố định (không cấu hình) để quyết định có hiện ô lọc theo tên/email trong
// dropdown hay không — danh sách ngắn thì lọc chỉ thêm thao tác thừa.
const FILTER_THRESHOLD = 8

// Đọc section (config/channels/menu/...) đang xem từ pathname hiện tại, để giữ nguyên
// khi đổi sang cửa hàng khác (vd đang ở /stores/A/orders -> chọn B ra /stores/B/orders,
// KHÔNG nhảy về config). Không tái dùng storeIdFromPath() vì hàm đó chỉ trả về id, cần
// thêm 1 bước đọc segment kế tiếp.
function currentSectionFromPath(pathname) {
  const m = typeof pathname === 'string' && pathname.match(/^\/stores\/[^/]+\/([^/]+)/)
  const key = m ? m[1] : null
  return isStoreSection(key) ? key : DEFAULT_STORE_SECTION
}

// Ô chọn/chuyển cửa hàng cố định ở ĐẦU sidebar. Admin: nút mở dropdown nhảy thẳng sang
// cửa hàng khác, giữ nguyên section đang xem. Portal: chỉ có đúng 1 cửa hàng (của chính
// chủ), không có gì để chuyển sang -> hiện thẻ TĨNH tên cửa hàng + email chủ, không mở
// được dropdown (Câu hỏi bỏ ngỏ #2 trong kế hoạch).
export default function StoreSwitcher({ stores, activeStoreId, onNavigate = () => {} }) {
  const location = useLocation()
  const section = currentSectionFromPath(location.pathname)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef(null)
  const buttonRef = useRef(null)

  const activeStore = stores?.find((s) => s.id === activeStoreId) ?? null

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  // Đóng dropdown + reset ô lọc mỗi khi danh sách cửa hàng đổi hẳn nguồn (vd điều hướng
  // về trang khác rồi quay lại) — tránh giữ query lọc cũ không còn liên quan.
  useEffect(() => {
    setOpen(false)
    setQuery('')
  }, [stores])

  const filtered = useMemo(() => {
    const list = stores || []
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.owner_email || '').toLowerCase().includes(q),
    )
  }, [stores, query])

  if (IS_PORTAL) {
    return (
      <div className="mb-4 rounded-xl border border-line bg-fg/[0.02] px-3 py-2.5">
        {activeStore ? (
          <>
            <div className="truncate text-sm font-semibold text-fg">{activeStore.name}</div>
            <div className="truncate text-xs text-fg/45">{activeStore.owner_email || 'Không có chủ sở hữu'}</div>
          </>
        ) : (
          <div className="text-sm text-fg/40">Đang tải…</div>
        )}
      </div>
    )
  }

  if (stores === null) {
    return (
      <div className="mb-4 h-[54px] animate-pulse rounded-xl border border-line bg-fg/[0.03]" />
    )
  }

  return (
    <div ref={rootRef} className="relative mb-4">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Chuyển cửa hàng"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-fg/[0.02] px-3 py-2.5 text-left transition-colors hover:bg-fg/[0.04]"
      >
        <div className="min-w-0 flex-1">
          {activeStore ? (
            <>
              <div className="truncate text-sm font-semibold text-fg">{activeStore.name}</div>
              <div className="truncate text-xs text-fg/45">{activeStore.owner_email || 'Không có chủ sở hữu'}</div>
            </>
          ) : (
            <>
              <div className="truncate text-sm font-semibold text-fg/60">Chọn cửa hàng</div>
              <div className="truncate text-xs text-fg/35">Chưa chọn cửa hàng nào</div>
            </>
          )}
        </div>
        <ChevronRight size={15} className={'shrink-0 text-fg/40 transition-transform ' + (open ? 'rotate-90' : '')} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-80 overflow-y-auto rounded-xl border border-line bg-surface2 p-1.5 shadow-lg"
        >
          {stores.length > FILTER_THRESHOLD && (
            <label className="relative mb-1 block">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg/35" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm theo tên hoặc email…"
                className="input w-full py-1.5 pl-8 text-xs"
              />
            </label>
          )}

          {filtered.length === 0 ? (
            <p className="px-2.5 py-3 text-center text-xs text-fg/35">Chưa có cửa hàng nào</p>
          ) : (
            filtered.map((s) => {
              const isActive = s.id === activeStoreId
              return (
                <Link
                  key={s.id}
                  role="menuitem"
                  to={storeSectionPath(s.id, section)}
                  onClick={() => {
                    setOpen(false)
                    onNavigate()
                  }}
                  className={
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ' +
                    (isActive ? 'bg-indigo-500/10 text-fg' : 'text-fg/70 hover:bg-fg/[0.05]')
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{s.name}</div>
                    <div className="truncate text-xs text-fg/40">{s.owner_email || 'Không có chủ sở hữu'}</div>
                  </div>
                  {isActive && <Check size={15} className="shrink-0 text-indigo-500" />}
                </Link>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
