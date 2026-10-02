import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { AlertTriangle, Ban, Check, CheckCheck, ClipboardList, MessageSquare, Wallet } from 'lucide-react'
import { api } from '../../lib/api'
import { CHANNEL_LABELS } from '../../lib/channels'
import { IS_PORTAL } from '../../lib/console'
import { storeSectionPath } from '../../lib/store-nav'
import { useConfirm } from '../../hooks/useConfirm'
import ConfirmDialog from '../../components/ConfirmDialog'
import EmptyState from '../../components/EmptyState'
import ErrorBanner from '../../components/ErrorBanner'

export default function StoreOrdersPage() {
  const { store } = useOutletContext()
  return <OrdersTab storeId={store.id} />
}

// Phải khớp RETAIL_LIFECYCLE ở app/main.py — chỉ để QUYẾT ĐỊNH HIỆN nút nào (UX), backend
// vẫn là nơi validate thật (400 nếu đẩy sai trạng thái), không tin tưởng tuyệt đối ở đây.
const RETAIL_LIFECYCLE = ['Chờ xác nhận', 'Đang đóng gói', 'Đang giao', 'Hoàn tất']

function OrdersTab({ storeId }) {
  const [orders, setOrders] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const { ask, dialogProps } = useConfirm()
  const navigate = useNavigate()

  function openConversation(o) {
    navigate(
      storeSectionPath(storeId, 'conversations') +
        `?channel=${o.channel}&sender=${encodeURIComponent(o.fb_psid)}`,
    )
  }

  function reload() {
    api.listOrders(storeId).then(setOrders).catch((e) => setError(e.message))
  }

  useEffect(reload, [storeId])

  async function handleAdvance(o) {
    setBusyId(o.id)
    setError('')
    try {
      await api.advanceOrder(o.id)
      reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  function handleCancel(o) {
    ask({
      title: `Huỷ đơn ${o.id}?`,
      message: `Khách ${o.customer_name} — ${Number(o.subtotal).toLocaleString('vi-VN')}đ. Không thể hoàn tác.`,
      confirmLabel: 'Huỷ đơn',
      danger: true,
      onConfirm: () =>
        api
          .cancelOrder(o.id)
          .then(reload)
          .catch((err) => setError(err.message)),
    })
  }

  async function handleUnflag(o) {
    setBusyId(o.id)
    setError('')
    try {
      await api.unflagOrder(o.id)
      reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleMarkPaid(o) {
    setBusyId(o.id)
    setError('')
    try {
      await api.markOrderPaid(o.id)
      reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleMarkRefunded(o) {
    setBusyId(o.id)
    setError('')
    try {
      await api.markOrderRefunded(o.id)
      reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  if (error && !orders) return <ErrorBanner message={error} />
  if (!orders) return <p className="text-fg/50">Đang tải…</p>
  if (orders.length === 0) return <EmptyState icon={ClipboardList} text="Chưa có đơn nào." />

  const sorted = [...orders].sort((a, b) => (b.flagged ? 1 : 0) - (a.flagged ? 1 : 0))
  const flaggedCount = orders.filter((o) => o.flagged).length

  return (
    <div className="card overflow-hidden">
      <ConfirmDialog {...dialogProps} />
      <ErrorBanner message={error} />
      {flaggedCount > 0 && (
        <div className="flex items-center gap-2 border-b border-rose-500/20 bg-rose-500/10 px-5 py-2.5 text-sm text-rose-700 dark:text-rose-300">
          <AlertTriangle size={15} />
          {flaggedCount} đơn khách đang than phiền, cần kiểm tra
        </div>
      )}
      <div className="scrollbar-thin max-h-[560px] overflow-x-auto overflow-y-auto">
        <table className="w-full min-w-[1020px] text-sm">
          <thead className="sticky top-0 bg-surface text-left text-fg/40">
            <tr>
              <th className="px-5 py-3 font-medium">Mã đơn</th>
              <th className="px-5 py-3 font-medium">Khách</th>
              <th className="px-5 py-3 font-medium">Kênh</th>
              <th className="px-5 py-3 font-medium">Trạng thái</th>
              <th className="px-5 py-3 font-medium">Thanh toán</th>
              <th className="px-5 py-3 text-right font-medium">Tổng tiền</th>
              <th className="px-5 py-3 font-medium">Lúc</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-fg/[0.05]">
            {sorted.map((o) => {
              const idx = RETAIL_LIFECYCLE.indexOf(o.status)
              const canAdvance = idx >= 0 && idx < RETAIL_LIFECYCLE.length - 1
              const canCancel = o.status !== 'Đã huỷ' && o.status !== 'Hoàn tất'
              const canMarkPaid = o.payment_status === 'chưa thanh toán'
              const canMarkRefunded = o.payment_status === 'cần hoàn tiền'
              const busy = busyId === o.id
              const finalTotal = o.subtotal - (o.discount_amount || 0)
              return (
                <tr
                  key={o.id}
                  className={'transition-colors hover:bg-fg/[0.02] ' + (o.flagged ? 'bg-rose-500/[0.06]' : '')}
                  title={o.flagged ? `Khách phàn nàn: ${o.flag_note || ''}` : undefined}
                >
                  <td className="px-5 py-3 text-fg/40">
                    <span className="flex items-center gap-1.5">
                      {Boolean(o.flagged) && <AlertTriangle size={13} className="text-rose-400" />}
                      {o.id}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-fg/90">{o.customer_name}</td>
                  <td className="px-5 py-3">
                    <ChannelPill channel={o.channel} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusPill status={o.status} />
                      {Boolean(o.flagged) && (
                        <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-medium text-rose-700 dark:text-rose-400">
                          ⚠️ Cần xử lý
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <PaymentStatusPill status={o.payment_status} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="text-fg/90">{Number(finalTotal).toLocaleString('vi-VN')}đ</div>
                    {Boolean(o.discount_amount) && (
                      <div className="text-xs text-fg/35">
                        {o.coupon_code ? `Mã ${o.coupon_code} · ` : ''}-{Number(o.discount_amount).toLocaleString('vi-VN')}đ
                      </div>
                    )}
                    {Boolean(o.points_earned) && <div className="text-xs text-fg/35">+{o.points_earned} điểm</div>}
                  </td>
                  <td className="px-5 py-3 text-fg/40">{o.created_at}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Chỉ chủ cửa hàng xem được hội thoại thật của khách — backend
                          (require_tenant_owner_store_access) chặn super_admin, nên không
                          hiện nút dẫn tới 403 ở admin. */}
                      {IS_PORTAL && Boolean(o.fb_psid) && (
                        <button
                          onClick={() => openConversation(o)}
                          title="Xem hội thoại"
                          className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-fg/50 transition-colors hover:bg-fg/[0.05] hover:text-fg/80"
                        >
                          <MessageSquare size={14} />
                          Xem hội thoại
                        </button>
                      )}
                      {canMarkPaid && (
                        <button
                          onClick={() => handleMarkPaid(o)}
                          disabled={busy}
                          title="Đánh dấu đã thanh toán"
                          className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-fg/50 transition-colors hover:bg-fg/[0.05] hover:text-fg/80 disabled:opacity-50"
                        >
                          <Wallet size={14} />
                          Đã thanh toán
                        </button>
                      )}
                      {canMarkRefunded && (
                        <button
                          onClick={() => handleMarkRefunded(o)}
                          disabled={busy}
                          title="Đánh dấu đã hoàn tiền"
                          className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-fg/50 transition-colors hover:bg-fg/[0.05] hover:text-fg/80 disabled:opacity-50"
                        >
                          <Wallet size={14} />
                          Đã hoàn tiền
                        </button>
                      )}
                      {Boolean(o.flagged) && (
                        <button
                          onClick={() => handleUnflag(o)}
                          disabled={busy}
                          title="Đánh dấu đã xử lý xong than phiền"
                          className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-fg/50 transition-colors hover:bg-fg/[0.05] hover:text-fg/80 disabled:opacity-50"
                        >
                          <CheckCheck size={14} />
                          Đã xử lý
                        </button>
                      )}
                      {canAdvance && (
                        <button
                          onClick={() => handleAdvance(o)}
                          disabled={busy}
                          title={`Chuyển sang "${RETAIL_LIFECYCLE[idx + 1]}"`}
                          className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-400"
                        >
                          <Check size={14} />
                          {IS_PORTAL ? `→ ${RETAIL_LIFECYCLE[idx + 1]}` : 'Đẩy tiếp'}
                        </button>
                      )}
                      {canCancel && (
                        <button
                          onClick={() => handleCancel(o)}
                          disabled={busy}
                          title="Huỷ đơn"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-fg/30 transition-colors hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50"
                        >
                          <Ban size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-fg/[0.06] px-5 py-2.5 text-xs text-fg/35">{orders.length} đơn</div>
    </div>
  )
}

function StatusPill({ status }) {
  const s = (status || '').toLowerCase()
  let cls = 'bg-fg/[0.06] text-fg/60'
  if (s.includes('huỷ') || s.includes('hủy')) cls = 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
  else if (s.includes('giao') || s.includes('hoàn') || s.includes('xong')) cls = 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
  else if (s.includes('chờ')) cls = 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
  return <span className={'rounded-full px-2.5 py-1 text-xs font-medium ' + cls}>{status}</span>
}

function PaymentStatusPill({ status }) {
  let cls = 'bg-fg/[0.06] text-fg/50'
  if (status === 'đã thanh toán') cls = 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
  else if (status === 'cần hoàn tiền') cls = 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
  else if (status === 'đã hoàn tiền') cls = 'bg-fg/[0.08] text-fg/60'
  return <span className={'rounded-full px-2.5 py-1 text-xs font-medium ' + cls}>{status || 'chưa thanh toán'}</span>
}

// Nhãn kênh nguồn của đơn (P1-1) — `orders.channel` lưu giá trị đúng theo
// `stores.CHANNEL_TYPES` ("facebook"/"zalo_oa"/"zalo_personal"); giá trị lạ/rỗng (dữ liệu
// cũ chèn tay, không kỳ vọng xảy ra với dữ liệu qua bot vì cột NOT NULL) hiện "—".
function ChannelPill({ channel }) {
  if (!channel) return <span className="text-xs text-fg/30">—</span>
  const label = CHANNEL_LABELS[channel] || channel
  const cls =
    channel === 'facebook'
      ? 'bg-blue-500/15 text-blue-700 dark:text-blue-400'
      : channel === 'zalo_personal'
      ? 'bg-sky-500/15 text-sky-700 dark:text-sky-400'
      : channel === 'zalo_oa'
      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
      : 'bg-fg/[0.06] text-fg/50'
  return <span className={'rounded-full px-2.5 py-1 text-xs font-medium ' + cls}>{label}</span>
}
