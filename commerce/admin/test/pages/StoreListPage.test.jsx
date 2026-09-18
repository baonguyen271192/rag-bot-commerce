import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import StoreListPage from '../../src/pages/StoreListPage'
import { api } from '../../src/lib/api'

vi.mock('../../src/lib/api', () => ({
  api: { listStores: vi.fn() },
}))

// api.listStores là mock DÙNG CHUNG (module-level) giữa mọi test trong file — phải
// reset cả lịch sử gọi VÀ hàng đợi mockResolvedValueOnce/mockRejectedValueOnce trước
// mỗi test, nếu không giá trị "once" còn sót từ test trước sẽ lọt sang test sau.
beforeEach(() => {
  api.listStores.mockReset()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <StoreListPage />
    </MemoryRouter>
  )
}

describe('StoreListPage — đường chạy thuận lợi', () => {
  it('tải xong thì hiện danh sách cửa hàng, không hiện lỗi/nút Thử lại', async () => {
    api.listStores.mockResolvedValue([
      {
        id: 'default', name: 'Default', business_type: 'shoe', fb_connected: true, menu_count: 5, order_count: 3, status: 'active',
        channels: { facebook: { enabled: true, connected: true }, zalo_personal: { enabled: false, connected: false }, zalo_oa: { enabled: false, connected: false } },
      },
    ])
    renderPage()
    expect(await screen.findByText('Default')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument()
  })
})

describe('StoreListPage — tách "cần xử lý" khỏi "đang hoạt động tốt" (dữ liệu thật GET /api/admin/stores luôn có channels)', () => {
  it('cửa hàng không có kênh nào connected -> rơi vào "Cần xử lý" kèm lý do; có ít nhất 1 kênh connected -> "Đang hoạt động tốt"', async () => {
    api.listStores.mockResolvedValue([
      {
        id: 'default', name: 'Giày BQ', business_type: 'shoe', fb_connected: true, menu_count: 626, order_count: 5, status: 'active',
        channels: { facebook: { enabled: true, connected: true }, zalo_personal: { enabled: false, connected: false }, zalo_oa: { enabled: false, connected: false } },
      },
      {
        id: 'shop2', name: 'Giày Nam Phong Cách', business_type: 'shoe', fb_connected: false, menu_count: 220, order_count: 0, status: 'active',
        channels: { facebook: { enabled: false, connected: false }, zalo_personal: { enabled: false, connected: false }, zalo_oa: { enabled: false, connected: false } },
      },
      {
        id: 'broken', name: 'Cửa hàng lỗi token', business_type: 'food', fb_connected: false, menu_count: 3, order_count: 0, status: 'active',
        channels: { facebook: { enabled: true, connected: false }, zalo_personal: { enabled: false, connected: false }, zalo_oa: { enabled: false, connected: false } },
      },
    ])
    renderPage()

    expect(await screen.findByText('Cần xử lý (2)')).toBeInTheDocument()
    expect(screen.getByText('Đang hoạt động tốt (1)')).toBeInTheDocument()
    expect(screen.getByText('Chưa bật kênh nào — bot chưa thể nhận tin nhắn từ khách.')).toBeInTheDocument()
    expect(screen.getByText('Đã bật Facebook nhưng chưa kết nối được.')).toBeInTheDocument()

    // CTA của card "cần xử lý" phải trỏ thẳng vào tab Kênh, không phải tab Cấu hình mặc định.
    const ctas = screen.getAllByRole('link', { name: /Kết nối ngay/ })
    expect(ctas).toHaveLength(2)
    expect(ctas[0]).toHaveAttribute('href', '/stores/shop2?tab=channels')
  })
})

describe('StoreListPage — trường hợp biên: nút "Thử lại" khi load() lỗi', () => {
  it('load() lỗi -> hiện ErrorBanner + nút "Thử lại"; bấm lại và thành công -> lỗi biến mất, danh sách hiện ra', async () => {
    api.listStores.mockRejectedValueOnce(new Error('Lỗi 502'))
    renderPage()

    const retryBtn = await screen.findByRole('button', { name: 'Thử lại' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi 502')
    expect(api.listStores).toHaveBeenCalledTimes(1)

    // Lần gọi lại (retry) trả về thành công
    api.listStores.mockResolvedValueOnce([
      { id: 'chao', name: 'Chao', business_type: 'food', fb_connected: false, menu_count: 2, order_count: 0, status: 'active' },
    ])

    await userEvent.click(retryBtn)

    await waitFor(() => expect(api.listStores).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Chao')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument()
  })

  it('load() lỗi liên tiếp (retry vẫn lỗi) -> nút "Thử lại" vẫn còn, KHÔNG tự ý hiện danh sách rỗng thay cho lỗi', async () => {
    api.listStores.mockRejectedValueOnce(new Error('Lỗi 502'))
    renderPage()
    const retryBtn = await screen.findByRole('button', { name: 'Thử lại' })

    api.listStores.mockRejectedValueOnce(new Error('Lỗi 502 (lần 2)'))
    await userEvent.click(retryBtn)

    await waitFor(() => expect(api.listStores).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi 502 (lần 2)')
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
  })
})

describe('StoreListPage — đầu vào sai: danh sách rỗng', () => {
  it('backend trả về [] (không lỗi) -> hiện thông báo "Chưa có cửa hàng nào.", KHÔNG hiện lỗi/Thử lại', async () => {
    api.listStores.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('Chưa có cửa hàng nào.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument()
  })
})
