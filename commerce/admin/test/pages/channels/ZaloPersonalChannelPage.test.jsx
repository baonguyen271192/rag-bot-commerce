import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ZaloPersonalChannelPage from '../../../src/pages/channels/ZaloPersonalChannelPage'
import { api } from '../../../src/lib/api'

vi.mock('../../../src/lib/api', () => ({
  api: { listStores: vi.fn(), restartZaloBridge: vi.fn() },
}))

beforeEach(() => {
  api.listStores.mockReset()
  api.restartZaloBridge.mockReset()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <ZaloPersonalChannelPage />
    </MemoryRouter>
  )
}

describe('ZaloPersonalChannelPage — đường chạy thuận lợi', () => {
  it('render không crash, chỉ liệt kê store ĐÃ bật zalo_personal (default), không liệt kê store chưa bật', async () => {
    api.listStores.mockResolvedValue([
      { id: 'default', name: 'Default', business_type: 'shoe', order_count: 5, channels: { zalo_personal: { enabled: true, connected: true } } },
      { id: 'chao', name: 'Chao', business_type: 'food', order_count: 0, channels: { zalo_personal: { enabled: false, connected: false } } },
    ])
    renderPage()
    expect(await screen.findByText('Zalo cá nhân')).toBeInTheDocument()
    expect(screen.getByText('Default')).toBeInTheDocument()
    expect(screen.queryByText('Chao')).not.toBeInTheDocument()
    // Cột "Tài khoản" luôn "—" (backend không có field này) — xem comment trong page.
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('ZaloPersonalChannelPage — trường hợp biên: nút "Khởi động lại Bridge" (stub, luôn lỗi)', () => {
  it('bấm nút -> gọi api.restartZaloBridge(), khi backend 404 thì hiện thông báo lỗi TRUNG THỰC (không giả vờ thành công)', async () => {
    api.listStores.mockResolvedValue([])
    api.restartZaloBridge.mockRejectedValue(new Error('Lỗi 404'))
    renderPage()

    const btn = await screen.findByRole('button', { name: 'Khởi động lại Bridge' })
    const { default: userEvent } = await import('@testing-library/user-event')
    await userEvent.click(btn)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Chưa thực hiện được/)
    expect(api.restartZaloBridge).toHaveBeenCalledTimes(1)
  })

  it('nút "Mở QR đăng nhập" bị disabled và có title giải thích — KHÔNG bấm được, không gây hiểu lầm là đã làm xong', async () => {
    api.listStores.mockResolvedValue([])
    renderPage()
    const qrBtn = await screen.findByRole('button', { name: 'Mở QR đăng nhập' })
    expect(qrBtn).toBeDisabled()
    expect(qrBtn.getAttribute('title')).toBeTruthy()
  })

  it('không có store nào bật kênh -> hiện thông báo trống + link "Chọn cửa hàng để bật"', async () => {
    api.listStores.mockResolvedValue([
      { id: 'chao', name: 'Chao', business_type: 'food', order_count: 0, channels: { zalo_personal: { enabled: false } } },
    ])
    renderPage()
    expect(await screen.findByText('Chưa cửa hàng nào bật Zalo cá nhân.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Chọn cửa hàng để bật' })).toBeInTheDocument()
  })
})

describe('ZaloPersonalChannelPage — đầu vào sai: API lỗi', () => {
  it('listStores() reject -> hiện ErrorBanner, không crash', async () => {
    api.listStores.mockRejectedValue(new Error('Lỗi 502'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi 502')
  })
})
