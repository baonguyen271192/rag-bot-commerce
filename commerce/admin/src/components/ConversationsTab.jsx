import { useEffect, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { api } from '../lib/api'
import { CHANNEL_LABELS } from '../lib/channels'
import ErrorBanner from './ErrorBanner'
import EmptyState from './EmptyState'

// Giờ hiển thị: DB lưu ISO UTC (`repository.now_iso()`, xem kế hoạch lưu-hội-thoại) — đổi
// sang giờ VN cho dễ đọc; chuỗi không parse được (hiếm, dữ liệu hỏng) thì trả nguyên văn
// thay vì hiện "Invalid Date".
function formatTime(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
}

// props: { storeId: string, initialThread?: {channel: string, senderId: string} | null }
// Chỉ-xem (không trả lời khách từ đây), không real-time — muốn thấy tin mới phải tải lại.
// KHÔNG dùng useAuth() (để test render được mà không cần AuthProvider bọc ngoài).
export default function ConversationsTab({ storeId, initialThread }) {
  const [threads, setThreads] = useState(null)
  const [threadsError, setThreadsError] = useState('')
  const [selected, setSelected] = useState(initialThread || null)
  const [messages, setMessages] = useState(null)
  const [msgError, setMsgError] = useState('')

  useEffect(() => {
    setThreads(null)
    setThreadsError('')
    api.listConversations(storeId).then(setThreads).catch((e) => setThreadsError(e.message))
  }, [storeId])

  // Deep-link: chọn sẵn đúng luồng khi trang cha (vd nút "Xem hội thoại" ở Đơn hàng)
  // truyền `initialThread` xuống.
  useEffect(() => {
    setSelected(initialThread || null)
  }, [initialThread])

  useEffect(() => {
    if (!selected) {
      setMessages(null)
      return
    }
    setMessages(null)
    setMsgError('')
    api
      .getConversation(storeId, selected.channel, selected.senderId)
      .then((body) => setMessages(body.messages))
      .catch((e) => setMsgError(e.message))
  }, [storeId, selected])

  if (threadsError) return <ErrorBanner message={threadsError} />
  if (!threads) return <p className="text-fg/50">Đang tải…</p>
  if (threads.length === 0) {
    return <EmptyState icon={MessageSquare} text="Chưa có hội thoại nào được lưu." />
  }

  const totalMessages = threads.reduce((sum, t) => sum + t.message_count, 0)

  return (
    <div className="card grid overflow-hidden md:grid-cols-[320px_1fr]">
      <div className="flex flex-col border-b border-line md:border-b-0 md:border-r">
        <div className="border-b border-line px-4 py-3">
          <h3 className="text-sm font-semibold text-fg">
            {threads.length} luồng · {totalMessages} tin đã lưu
          </h3>
        </div>
        <div className="scrollbar-thin max-h-[560px] overflow-y-auto">
          {threads.map((t) => {
            const isActive = Boolean(
              selected && selected.channel === t.channel && selected.senderId === t.sender_id,
            )
            return (
              <button
                key={`${t.channel}:${t.sender_id}`}
                type="button"
                onClick={() => setSelected({ channel: t.channel, senderId: t.sender_id })}
                className={
                  'block w-full cursor-pointer border-b border-fg/[0.05] px-4 py-3 text-left transition-colors ' +
                  'hover:bg-fg/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset ' +
                  (isActive ? 'bg-indigo-500/[0.08]' : '')
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-fg/60">
                    {CHANNEL_LABELS[t.channel] || t.channel}
                  </span>
                  <span className="text-xs text-fg/50">{formatTime(t.last_at)}</span>
                </div>
                <div className="mt-0.5 truncate text-sm text-fg/90">{t.sender_id}</div>
                <div className="mt-1 truncate text-xs text-fg/50">
                  {t.last_direction === 'out' ? 'Bot: ' : 'Khách: '}
                  {t.last_text || '(không có nội dung)'}
                </div>
                <div className="mt-0.5 text-xs text-fg/35">{t.message_count} tin</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex min-h-[420px] flex-col">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-fg/35">
            Chọn 1 luồng bên trái để xem transcript.
          </div>
        ) : msgError ? (
          <div className="p-4">
            <ErrorBanner message={msgError} />
          </div>
        ) : !messages ? (
          <p className="p-4 text-fg/50">Đang tải…</p>
        ) : messages.length === 0 ? (
          <EmptyState icon={MessageSquare} text="Luồng này chưa có tin nhắn nào được lưu." />
        ) : (
          <div className="scrollbar-thin flex max-h-[560px] flex-col gap-3 overflow-y-auto p-4">
            {messages.map((m) => (
              <div key={m.id} className={'flex ' + (m.direction === 'in' ? 'justify-start' : 'justify-end')}>
                <div
                  className={
                    'max-w-[70%] rounded-lg px-3 py-2 ' +
                    (m.direction === 'in' ? 'bg-fg/[0.06]' : 'bg-indigo-500/15')
                  }
                >
                  <div className="mb-1 text-xs font-medium text-fg/50">
                    {m.direction === 'in' ? 'Khách' : 'Bot'} · {formatTime(m.created_at)}
                  </div>
                  <div className="whitespace-pre-wrap text-sm text-fg/90">
                    {m.text || '(không có nội dung)'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
