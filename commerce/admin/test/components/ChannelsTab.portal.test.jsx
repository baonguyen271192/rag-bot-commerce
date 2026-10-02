import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// IS_PORTAL được tính 1 LẦN lúc import từ window.location.pathname — không đổi được
// bằng cách sửa window.location sau khi module đã import, nên mock thẳng lib/console.
// File này mặc định IS_PORTAL: true (đa số test ở đây kiểm nội dung portal); test cần
// bản admin (IS_PORTAL: false) tự vi.resetModules() + vi.doMock + import động riêng,
// đúng kiểu test/components/StoreSwitcher.test.jsx đã làm.
vi.mock('../../src/lib/console', () => ({
  IS_PORTAL: true,
  EXPECTED_ROLE: 'tenant_owner',
  CONSOLE_PREFIX: '/portal',
  OTHER_PREFIX: '/admin',
  ADMIN_PREFIX: '/admin',
  PORTAL_PREFIX: '/portal',
}))

vi.mock('../../src/lib/api', () => ({
  api: {
    setChannel: vi.fn(),
    removeChannel: vi.fn(),
  },
}))

vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({ user: { role: 'tenant_owner' } }),
}))

import ChannelsTab from '../../src/components/ChannelsTab'
import { api } from '../../src/lib/api'

const STORE = {
  id: 'shop2',
  name: 'Shop2',
  plan_label: 'Pro',
  plan_features: ['facebook', 'zalo_personal', 'zalo_oa'],
  channels: {
    facebook: { enabled: true, connected: false, page_id: '' },
    zalo_personal: { enabled: true, connected: false },
    zalo_oa: { enabled: true, connected: true, oa_id: 'oa123', has_oa_access_token: true },
  },
}

function renderPortal(store = STORE) {
  return render(
    <MemoryRouter>
      <ChannelsTab store={store} onChanged={() => {}} />
    </MemoryRouter>
  )
}

beforeEach(() => {
  api.setChannel.mockReset()
  api.removeChannel.mockReset()
})

describe('ChannelsTab (portal) — đường chạy thuận lợi', () => {
  it('zalo_oa.enabled === true -> không hiện 4 ô nhập, hiện câu "đang trong giai đoạn thử nghiệm"', () => {
    renderPortal()
    expect(screen.queryByText('OA Access Token')).not.toBeInTheDocument()
    expect(screen.queryByText('OA ID')).not.toBeInTheDocument()
    expect(screen.queryByText('App Secret')).not.toBeInTheDocument()
    expect(screen.queryByText('OA Refresh Token')).not.toBeInTheDocument()
    expect(screen.getByText(/đang trong giai đoạn thử nghiệm/)).toBeInTheDocument()
    // "Lưu thông tin kênh" vẫn còn ở thẻ Facebook (giữ nguyên) — chỉ Zalo OA mất nút này,
    // nên tổng số nút Lưu trong trang phải đúng 1 (không phải 2 như bản admin).
    expect(screen.getAllByText('Lưu thông tin kênh')).toHaveLength(1)
    expect(screen.queryByText('Ngắt kết nối & xoá thông tin kênh này')).not.toBeInTheDocument()
  })

  it('Facebook hiện nhãn + note "nhờ người phụ trách kỹ thuật"', () => {
    renderPortal()
    expect(screen.getByText('Mã Fanpage (Page ID)')).toBeInTheDocument()
    expect(screen.getByText('Mã kết nối Fanpage (Page Access Token)')).toBeInTheDocument()
    expect(screen.getByText(/nhờ người phụ trách kỹ thuật/)).toBeInTheDocument()
  })

  it('Zalo cá nhân hiện đúng 1 note gộp, không nhắc "zalo-bridge"/"khởi động lại"', () => {
    renderPortal()
    expect(screen.getByText(/Cần quét mã QR bằng ứng dụng Zalo/)).toBeInTheDocument()
    expect(screen.queryByText(/zalo-bridge/)).not.toBeInTheDocument()
    expect(screen.queryByText(/khởi động lại/)).not.toBeInTheDocument()
  })
})

describe('ChannelsTab (admin) — trường hợp biên: IS_PORTAL = false', () => {
  it('cùng dữ liệu nhưng ở /admin -> 4 nhãn ô Zalo OA đều có mặt, vẫn có nút Lưu + Ngắt kết nối', async () => {
    vi.resetModules()
    vi.doMock('../../src/lib/console', () => ({
      IS_PORTAL: false,
      EXPECTED_ROLE: 'super_admin',
      CONSOLE_PREFIX: '/admin',
      OTHER_PREFIX: '/portal',
      ADMIN_PREFIX: '/admin',
      PORTAL_PREFIX: '/portal',
    }))
    const { default: AdminChannelsTab } = await import('../../src/components/ChannelsTab')

    render(
      <MemoryRouter>
        <AdminChannelsTab store={STORE} onChanged={() => {}} />
      </MemoryRouter>
    )

    expect(screen.getByText('OA ID')).toBeInTheDocument()
    expect(screen.getByText('App Secret')).toBeInTheDocument()
    expect(screen.getByText('OA Access Token')).toBeInTheDocument()
    expect(screen.getByText('OA Refresh Token')).toBeInTheDocument()
    // "Lưu thông tin kênh" xuất hiện ở cả thẻ Facebook lẫn Zalo OA (2 nút Lưu độc lập).
    expect(screen.getAllByText('Lưu thông tin kênh').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Ngắt kết nối & xoá thông tin kênh này')).toBeInTheDocument()
    expect(screen.getByText('Facebook Page ID')).toBeInTheDocument()
    expect(screen.getByText('Page Access Token')).toBeInTheDocument()

    vi.doUnmock('../../src/lib/console')
    vi.resetModules()
  })
})

describe('ChannelsTab (portal) — đầu vào sai', () => {
  it('Facebook page_id rỗng -> vẫn render được form + note hỗ trợ, không crash', () => {
    const store = {
      ...STORE,
      channels: { ...STORE.channels, facebook: { enabled: true, connected: false, page_id: '' } },
    }
    expect(() => renderPortal(store)).not.toThrow()
    expect(screen.getByText(/nhờ người phụ trách kỹ thuật/)).toBeInTheDocument()
  })
})
