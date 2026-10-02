import { useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import ConversationsTab from '../../components/ConversationsTab'

// Vỏ mỏng: nạp {store} từ StoreLayout (route cha), đọc ?channel=&sender= lúc mount để
// deep-link từ nút "Xem hội thoại" ở StoreOrdersPage mở sẵn đúng luồng (F5 vẫn mở đúng
// luồng đó vì tham số nằm trên URL, không chỉ trong state React).
export default function StoreConversationsPage() {
  const { store } = useOutletContext()
  const [searchParams] = useSearchParams()
  const [initialThread] = useState(() => {
    const channel = searchParams.get('channel')
    const sender = searchParams.get('sender')
    return channel && sender ? { channel, senderId: sender } : null
  })
  return <ConversationsTab storeId={store.id} initialThread={initialThread} />
}
