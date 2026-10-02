import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'

// Modal xác nhận dùng chung thay cho window.confirm() — popup trình duyệt mặc định phá
// vỡ theme dark "Con Dấu Tiệm" đã đầu tư kỹ. Escape để huỷ, click ra ngoài để huỷ (trừ
// lúc đang busy — tránh đóng nhầm giữa chừng 1 request đang chạy).
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Huỷ',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null)

  useEffect(() => {
    if (!open) return
    confirmRef.current?.focus()
    function onKeyDown(e) {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel()
      }}
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" className="card w-full max-w-sm p-5">
        <div className="flex items-start gap-3">
          {danger && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-500">
              <AlertTriangle size={18} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id="confirm-dialog-title" className="text-sm font-semibold text-fg">
              {title}
            </h2>
            {message && <p className="mt-1.5 text-sm text-fg/60">{message}</p>}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-line-strong px-3.5 py-2 text-sm font-medium text-fg transition-colors hover:bg-fg/[0.05] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={
              'rounded-lg px-3.5 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 ' +
              (danger ? 'bg-rose-600 hover:bg-rose-700' : 'btn-primary')
            }
          >
            {busy ? 'Đang xử lý…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
