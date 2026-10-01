async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    // Cookie phiên đăng nhập (httpOnly, đặt bởi /api/auth/login) — bắt buộc để mọi call
    // /api/admin/* sau này gửi kèm cookie, kể cả khi vite dev chạy port riêng (5173).
    credentials: 'include',
    ...options,
  })
  if (!res.ok) {
    let detail = `Lỗi ${res.status}`
    try {
      const body = await res.json()
      detail = body.detail || detail
    } catch {
      // ignore — không có body JSON
    }
    throw new Error(detail)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request('/api/auth/me'),
  listPlans: () => request('/api/admin/plans'),
  listBusinessTypes: () => request('/api/admin/business-types'),
  listStores: () => request('/api/admin/stores'),
  getStore: (id) => request(`/api/admin/stores/${id}`),
  createStore: (body) => request('/api/admin/stores', { method: 'POST', body: JSON.stringify(body) }),
  updateStore: (id, patch) => request(`/api/admin/stores/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteStore: (id) => request(`/api/admin/stores/${id}`, { method: 'DELETE' }),
  addMenuItem: (id, item) => request(`/api/admin/stores/${id}/menu`, { method: 'POST', body: JSON.stringify(item) }),
  removeMenuItem: (id, code) => request(`/api/admin/stores/${id}/menu/${code}`, { method: 'DELETE' }),
  listOrders: (storeId) => request(`/api/orders?store_id=${storeId}`),
  getChannels: (id) => request(`/api/admin/stores/${id}/channels`),
  setChannel: (id, ctype, cfg) =>
    request(`/api/admin/stores/${id}/channels/${ctype}`, { method: 'PUT', body: JSON.stringify(cfg) }),
  removeChannel: (id, ctype) => request(`/api/admin/stores/${id}/channels/${ctype}`, { method: 'DELETE' }),
  resetOwnerPassword: (id, newPassword) =>
    request(`/api/admin/stores/${id}/owner/reset-password`, { method: 'POST', body: JSON.stringify({ new_password: newPassword }) }),
  setPlan: (id, planId) =>
    request(`/api/admin/stores/${id}/plan`, { method: 'PUT', body: JSON.stringify({ plan_id: planId }) }),
  changePassword: (oldPw, newPw) =>
    request('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ old_password: oldPw, new_password: newPw }) }),
  // STUB — endpoint này CHƯA tồn tại ở backend (commerce/app/main.py). zalo-bridge hiện
  // không có API "restart cả tiến trình" (chỉ có /tenants/:id/logout cho từng phiên) và
  // commerce cũng chưa có route nào proxy sang đó. Gọi hàm này sẽ luôn 404 — trang
  // ZaloPersonalChannelPage bắt lỗi và hiện thông báo trung thực, KHÔNG giả vờ đã restart.
  // TODO: thêm route thật (vd POST /api/admin/zalo-bridge/restart ở commerce, proxy sang
  // một endpoint quản trị mới trên commerce/zalo-bridge) rồi đổi path này cho khớp.
  restartZaloBridge: () => request('/api/admin/zalo-bridge/restart', { method: 'POST' }),
}
