import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ZaloOaChannelPage from '../../../src/pages/channels/ZaloOaChannelPage'
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
      <ZaloOaChannelPage />
    </MemoryRouter>
  )
}

describe('ZaloOaChannelPage — đường chạy thuận lợi', () => {
  it('render không crash, hiện nhãn Beta + banner "Chưa xác minh"', async () => {
    api.listStores.mockResolvedValue([
      { id: 'default', name: 'Default', business_type: 'shoe', order_count: 5, channels: { zalo_oa: { enabled: false } } },
    ])
    renderPage()
    expect(await screen.findByText('Zalo OA')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('Chưa xác minh:')).toBeInTheDocument()
  })
})

describe('ZaloOaChannelPage — trường hợp biên: KHÔNG có store nào bật Zalo OA (giống 3 store demo thật)', () => {
  it('cả 3 store demo default/shop2/chao đều chưa bật Zalo OA -> hiện thông báo trống, KHÔNG bịa dữ liệu', async () => {
    api.listStores.mockResolvedValue([
      { id: 'default', name: 'Default', business_type: 'shoe', order_count: 5, channels: { zalo_oa: { enabled: false } } },
      { id: 'shop2', name: 'Shop2', business_type: 'shoe', order_count: 1, channels: { zalo_oa: { enabled: false } } },
      { id: 'chao', name: 'Chao', business_type: 'food', order_count: 0, channels: { zalo_oa: { enabled: false } } },
    ])
    renderPage()
    expect(await screen.findByText('Chưa cửa hàng nào bật Zalo OA.')).toBeInTheDocument()
    expect(screen.getByText('OA đã kết nối').parentElement).toHaveTextContent('0')
  })
})

describe('ZaloOaChannelPage — đầu vào sai: API lỗi', () => {
  it('listStores() reject -> hiện ErrorBanner, không crash', async () => {
    api.listStores.mockRejectedValue(new Error('Lỗi 502'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi 502')
  })
})
