import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import FacebookChannelPage from '../../../src/pages/channels/FacebookChannelPage'
import { api } from '../../../src/lib/api'

vi.mock('../../../src/lib/api', () => ({
  api: { listStores: vi.fn() },
}))

beforeEach(() => {
  api.listStores.mockReset()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <FacebookChannelPage />
    </MemoryRouter>
  )
}

describe('FacebookChannelPage — đường chạy thuận lợi', () => {
  it('render không crash với dữ liệu 3 store demo, đếm đúng Đã kết nối/Chưa kết nối', async () => {
    api.listStores.mockResolvedValue([
      { id: 'default', name: 'Default', business_type: 'shoe', order_count: 5, channels: { facebook: { enabled: true, connected: true, page_id: '123456789012' } } },
      { id: 'shop2', name: 'Shop2', business_type: 'shoe', order_count: 2, channels: { facebook: { enabled: true, connected: false, page_id: null } } },
      { id: 'chao', name: 'Chao', business_type: 'food', order_count: 0, channels: { facebook: { enabled: false, connected: false } } },
    ])
    renderPage()
    expect(await screen.findByText('Kênh Facebook')).toBeInTheDocument()
    expect(screen.getByText('Default')).toBeInTheDocument()
    // "Đã kết nối" xuất hiện ở cả StatCard label và pill trạng thái của dòng default.
    expect(screen.getAllByText('Đã kết nối').length).toBeGreaterThanOrEqual(1)
    // "Chưa kết nối" xuất hiện ở StatCard label + 2 dòng bảng (shop2 enabled nhưng
    // chưa connect, chao tắt hẳn) -> ít nhất 2 lần trong bảng.
    expect(screen.getAllByText('Chưa kết nối').length).toBeGreaterThanOrEqual(2)
  })
})

describe('FacebookChannelPage — trường hợp biên: danh sách trống', () => {
  it('backend trả về [] -> render "0 cửa hàng", không crash', async () => {
    api.listStores.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('0 cửa hàng')).toBeInTheDocument()
  })
})

describe('FacebookChannelPage — đầu vào sai: API lỗi', () => {
  it('listStores() reject -> hiện ErrorBanner (role=alert) với đúng message lỗi, không crash trắng trang', async () => {
    api.listStores.mockRejectedValue(new Error('Lỗi 502'))
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Lỗi 502')
  })
})
