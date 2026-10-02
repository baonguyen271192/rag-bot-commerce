import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useParams } from 'react-router-dom'
import { Box, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { bizOf } from '../../lib/business'
import { useAuth } from '../../lib/auth'
import { useConfirm } from '../../hooks/useConfirm'
import ConnectionBadge from '../../components/ConnectionBadge'
import ConfirmDialog from '../../components/ConfirmDialog'
import ErrorBanner from '../../components/ErrorBanner'
import OwnerAccountCard from '../../components/OwnerAccountCard'
import PlanCard from '../../components/PlanCard'

// Route cha của 7 trang con (xem lib/store-nav.js) — nạp đúng 1 cửa hàng theo :id và
// cấp {store, reload} cho con qua <Outlet context>. Thay vai trò "khung" của trang chi
// tiết cửa hàng cũ (1 file gộp các tab, đã xoá khi tách route); header (tên + badge
// ngành/gói + số món/đơn + badge kết nối + nút "Xoá cửa hàng") giữ NGUYÊN VĂN, chỉ bỏ
// link "← Danh sách cửa hàng" và dải tab ngang — 7 mục đó giờ sống trong sidebar
// (AppShell), không phải trong trang.
//
// Mô hình phân quyền đã chốt (BA/PO, xem app/auth.py require_tenant_owner_store_access):
// super_admin KHÔNG được xem/sửa nội dung vận hành của bất kỳ cửa hàng nào (config bot,
// kênh, menu, đơn hàng, khách hàng, khuyến mãi, hội thoại) — chỉ quản lý DANH SÁCH cửa
// hàng + GÓI dịch vụ đang dùng. Vì vậy super_admin KHÔNG render <Outlet> (7 route con đều
// gọi API giờ đã 403 với super_admin) mà render thẳng 2 khối việc admin còn được làm:
// tài khoản chủ cửa hàng (reset mật khẩu hộ) + gói dịch vụ. tenant_owner (portal) mới
// render <Outlet> — họ toàn quyền trên chính cửa hàng của mình.
export default function StoreLayout() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [store, setStore] = useState(null)
  const [error, setError] = useState('')
  const { ask, dialogProps } = useConfirm()

  function reload() {
    api.getStore(id).then(setStore).catch((e) => setError(e.message))
  }

  useEffect(reload, [id])

  if (error) return <ErrorBanner message={error} />
  if (!store) return <p className="text-fg/50">Đang tải…</p>

  const isSuperAdmin = user?.role === 'super_admin'

  function handleDelete() {
    ask({
      title: `Xoá cửa hàng "${store.name}"?`,
      message: 'Xoá menu, đơn hàng, kênh đã kết nối của cửa hàng này — KHÔNG thể hoàn tác.',
      confirmLabel: 'Xoá cửa hàng',
      danger: true,
      onConfirm: () => api.deleteStore(store.id).then(() => navigate('/stores')).catch((e) => setError(e.message)),
    })
  }

  return (
    <div>
      <ConfirmDialog {...dialogProps} />

      <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">{store.name}</h1>
            <BizBadge store={store} />
            <PlanBadge store={store} />
          </div>
          <p className="mt-1 text-sm text-fg/45">
            {store.menu_count} món · {store.order_count} đơn đã chốt qua bot
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <ConnectionBadge connected={store.fb_connected} />
          {isSuperAdmin && !store.builtin && (
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-rose-500/25 px-3 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-400"
            >
              <Trash2 size={14} />
              Xoá cửa hàng
            </button>
          )}
        </div>
      </div>

      {isSuperAdmin ? (
        <div className="max-w-[1100px] mx-auto space-y-6">
          <OwnerAccountCard store={store} />
          <PlanCard store={store} onChanged={reload} />
        </div>
      ) : (
        <Outlet context={{ store, reload }} />
      )}
    </div>
  )
}

function BizBadge({ store }) {
  const biz = bizOf(store)
  const Icon = biz.icon
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-fg/[0.06] px-2.5 py-1 text-xs font-medium text-fg/60">
      <Icon size={12} />
      {biz.label}
    </span>
  )
}

// Badge gói dịch vụ cạnh BizBadge ở header — chỉ hiển thị (không bấm được ở đây), đổi
// gói thật làm ở khối PlanCard bên dưới (admin) / trong tab Cấu hình (portal).
function PlanBadge({ store }) {
  return (
    <span
      title="Xem/đổi ở mục Gói dịch vụ bên dưới"
      className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300"
    >
      <Box size={12} />
      Gói {store.plan_label}
    </span>
  )
}
