import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { attentionInfo, sortAttention } from '../lib/channels'

// Dùng chung cho Tổng quan (digest) và Cửa hàng (danh sách quản lý) — cả hai đọc cùng
// GET /api/admin/stores, chỉ khác cách trình bày.
export function useStoreOverview() {
  const [stores, setStores] = useState(null)
  const [error, setError] = useState('')

  function load() {
    setError('')
    setStores(null)
    api.listStores().then(setStores).catch((e) => setError(e.message))
  }

  useEffect(load, [])

  const totalOrders = stores?.reduce((sum, s) => sum + s.order_count, 0) ?? 0
  const attentionRaw = stores?.map((s) => ({ store: s, info: attentionInfo(s) })).filter((r) => r.info) ?? []
  const attention = sortAttention(attentionRaw)
  const healthy = stores?.filter((s) => !attentionInfo(s)) ?? []

  return { stores, error, load, totalOrders, attention, healthy }
}
