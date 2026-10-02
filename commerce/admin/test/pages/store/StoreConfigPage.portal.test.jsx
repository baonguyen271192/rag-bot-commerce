import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, Outlet } from 'react-router-dom'

// IS_PORTAL được tính 1 LẦN lúc import từ window.location.pathname — mock thẳng
// lib/console thay vì đổi window.location sau khi module đã import (đúng tiền lệ
// test/components/StoreSwitcher.test.jsx).
vi.mock('../../../src/lib/console', () => ({
  IS_PORTAL: true,
  EXPECTED_ROLE: 'tenant_owner',
  CONSOLE_PREFIX: '/portal',
  OTHER_PREFIX: '/admin',
  ADMIN_PREFIX: '/admin',
  PORTAL_PREFIX: '/portal',
}))

vi.mock('../../../src/lib/api', () => ({
  api: {
    listBusinessTypes: vi.fn(),
    listPlans: vi.fn(),
    updateStore: vi.fn(),
    resetOwnerPassword: vi.fn(),
    setPlan: vi.fn(),
    listOrders: vi.fn(),
  },
}))

vi.mock('../../../src/lib/auth', () => ({
  useAuth: () => ({ user: { role: 'tenant_owner' } }),
}))

import StoreConfigPage from '../../../src/pages/store/StoreConfigPage'
import StoreMenuPage from '../../../src/pages/store/StoreMenuPage'
import { api } from '../../../src/lib/api'

const BASE_STORE = {
  id: 'shop2',
  name: 'Shop2',
  shop_label: '',
  business_type: 'shoe',
  unit: 'đôi',
  tone: 'warm',
  status: 'active',
  custom_prompt: '',
  variant_mode: 'so',
  variant_min: 24,
  variant_max: 46,
  variant_labels: [],
  policies: {},
  loyalty_spend_per_point: '',
  loyalty_redeem_rate: '',
  owner_email: 'shop2@example.com',
  plan_id: 'pro',
  plan_label: 'Pro',
  plan_features: ['facebook'],
  builtin: false,
  menu: [],
}

// Bọc trang trong 1 route layout giả để cấp outlet context {store, reload} — đúng
// shape mà StoreLayout.jsx thật cấp cho các trang con qua useOutletContext().
function TestLayout({ store, reload }) {
  return <Outlet context={{ store, reload }} />
}

function renderConfig(store = BASE_STORE, reload = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<TestLayout store={store} reload={reload} />}>
          <Route path="/" element={<StoreConfigPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

function renderMenu(store = BASE_STORE, reload = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<TestLayout store={store} reload={reload} />}>
          <Route path="/" element={<StoreMenuPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  api.listBusinessTypes.mockReset().mockResolvedValue([
    { key: 'shoe', label: 'Giày dép', unit: 'đôi', variant_mode: 'so', variant_min: 35, variant_max: 43 },
    { key: 'food', label: 'Đồ ăn', unit: 'phần', variant_mode: 'khong_co' },
  ])
  api.listPlans.mockReset().mockResolvedValue([{ key: 'pro', label: 'Pro' }])
  api.updateStore.mockReset().mockResolvedValue({})
  api.resetOwnerPassword.mockReset()
  api.setPlan.mockReset()
  api.listOrders.mockReset().mockResolvedValue([])
})

describe('StoreConfigPage (portal) — đường chạy thuận lợi', () => {
  it('ẩn hẳn ô "Prompt tuỳ chỉnh cho AI", đổi câu chữ "Cách chia size sản phẩm"', async () => {
    renderConfig()
    await waitFor(() => expect(api.listBusinessTypes).toHaveBeenCalled())
    expect(screen.queryByText(/Prompt tuỳ chỉnh cho AI/)).not.toBeInTheDocument()
    expect(screen.getByText('Cách chia size sản phẩm')).toBeInTheDocument()
    expect(screen.queryByText('Kiểu biến thể sản phẩm')).not.toBeInTheDocument()
    expect(screen.getByText('Sản phẩm của bạn chia size kiểu nào?')).toBeInTheDocument()
  })

  it('store.custom_prompt có nội dung -> hiện đúng 1 dòng chỉ đọc, không hiện nội dung prompt', async () => {
    renderConfig({ ...BASE_STORE, custom_prompt: 'Luôn gợi ý thêm phụ kiện.' })
    await waitFor(() => expect(api.listBusinessTypes).toHaveBeenCalled())
    expect(screen.getByText('Quản trị viên đã thêm quy tắc riêng cho AI của cửa hàng này.')).toBeInTheDocument()
    expect(screen.queryByText('Luôn gợi ý thêm phụ kiện.')).not.toBeInTheDocument()
  })

  it('bấm "Lưu thay đổi" -> body gửi lên KHÔNG chứa key custom_prompt', async () => {
    renderConfig({ ...BASE_STORE, custom_prompt: 'Quy tắc cũ do admin đặt.' })
    await waitFor(() => expect(api.listBusinessTypes).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', { name: /Lưu thay đổi/ }))
    await waitFor(() => expect(api.updateStore).toHaveBeenCalled())
    const [, patch] = api.updateStore.mock.calls[0]
    expect(Object.prototype.hasOwnProperty.call(patch, 'custom_prompt')).toBe(false)
  })
})

describe('StoreConfigPage (portal) — trường hợp biên', () => {
  it("variant_mode === 'khong_co' -> không hiện ô size nào ở Cấu hình", async () => {
    renderConfig({ ...BASE_STORE, variant_mode: 'khong_co' })
    await waitFor(() => expect(api.listBusinessTypes).toHaveBeenCalled())
    expect(screen.queryByText('Size nhỏ nhất')).not.toBeInTheDocument()
    expect(screen.queryByText('Size lớn nhất')).not.toBeInTheDocument()
    expect(screen.queryByText('Các size có bán')).not.toBeInTheDocument()
  })

  it("variant_mode === 'khong_co' -> ở Menu hiện ô 'Số lượng còn', không hiện dòng hướng dẫn size:số_lượng", () => {
    renderMenu({ ...BASE_STORE, variant_mode: 'khong_co' })
    expect(screen.getByPlaceholderText('Số lượng còn (để trống nếu không đếm tồn kho)')).toBeInTheDocument()
    expect(screen.queryByText(/Viết theo kiểu size:số_lượng/)).not.toBeInTheDocument()
  })

  it("variant_mode === 'so' -> ở Menu hiện placeholder gọn + dòng hướng dẫn size:số_lượng", () => {
    renderMenu({ ...BASE_STORE, variant_mode: 'so' })
    expect(screen.getByPlaceholderText('Vd: 39:5, 40:3')).toBeInTheDocument()
    expect(screen.getByText(/size 39 còn 5, size 40 còn 3/)).toBeInTheDocument()
  })
})

describe('StoreConfigPage (portal) — đầu vào sai (bắt buộc phải thất bại đúng cách)', () => {
  it("variant_mode: 'nhan' + ô size để trống -> báo lỗi \"Cần điền ít nhất 1 size…\", KHÔNG gọi API", async () => {
    renderConfig({ ...BASE_STORE, variant_mode: 'nhan', variant_labels: [] })
    await waitFor(() => expect(api.listBusinessTypes).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', { name: /Lưu thay đổi/ }))
    expect(await screen.findByText(/Cần điền ít nhất 1 size/)).toBeInTheDocument()
    expect(api.updateStore).not.toHaveBeenCalled()
  })
})
