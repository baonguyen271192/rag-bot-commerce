import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppShell from '../../src/components/AppShell'
import { api } from '../../src/lib/api'

vi.mock('../../src/lib/api', () => ({
  api: { listStores: vi.fn() },
}))

// Đúng 3 cửa hàng demo (default/shop2/chao) — dùng để đối chiếu logic đếm
// active/tổng trong channels.js với dữ liệu có hình dạng giống thật.
const THREE_DEMO_STORES = [
  { id: 'default', name: 'Default', channels: { facebook: { enabled: true }, zalo_personal: { enabled: true }, zalo_oa: { enabled: false } } },
  { id: 'shop2', name: 'Shop2', channels: { facebook: { enabled: true }, zalo_personal: { enabled: false }, zalo_oa: { enabled: false } } },
  { id: 'chao', name: 'Chao', channels: { facebook: { enabled: false }, zalo_personal: { enabled: false }, zalo_oa: { enabled: false } } },
]

beforeEach(() => {
  api.listStores.mockReset()
})

function renderShellAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell>
        <div>nội dung trang</div>
      </AppShell>
    </MemoryRouter>
  )
}

describe('AppShell — đường chạy thuận lợi', () => {
  it('render ở "/" — không crash, mục "Tổng quan"/"Cửa hàng" hiện ra, accordion Zalo ĐANG ĐÓNG (không hiện 2 mục con)', async () => {
    api.listStores.mockResolvedValue(THREE_DEMO_STORES)
    renderShellAt('/')
    // "Tổng quan" xuất hiện 2 lần (nhãn nhóm NavLabel + mục NavItem) — cố ý theo thiết kế.
    expect((await screen.findAllByText('Tổng quan')).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Cửa hàng')).toBeInTheDocument()
    expect(screen.getByText('nội dung trang')).toBeInTheDocument()
    // Accordion Zalo đóng mặc định khi không ở trang con Zalo
    expect(screen.queryByText('Zalo cá nhân')).not.toBeInTheDocument()
    expect(screen.queryByText('Zalo OA')).not.toBeInTheDocument()
  })

  it('badge Facebook đúng active/tổng theo dữ liệu 3 store demo (2 bật facebook / 3 tổng -> amber, hiện "2/3")', async () => {
    api.listStores.mockResolvedValue(THREE_DEMO_STORES)
    renderShellAt('/')
    const fbBadge = await screen.findByTitle('2 đã kết nối / 3 cửa hàng')
    expect(fbBadge).toHaveTextContent('2/3')
    expect(fbBadge.className).toContain('amber')
  })
})

describe('AppShell — trường hợp biên: accordion Zalo mở khi ở trang con', () => {
  it('render ở "/channels/zalo-personal" — accordion Zalo tự mở, hiện "Zalo cá nhân" và "Zalo OA", "Zalo cá nhân" active', async () => {
    api.listStores.mockResolvedValue(THREE_DEMO_STORES)
    renderShellAt('/channels/zalo-personal')
    expect(await screen.findByText('Zalo cá nhân')).toBeInTheDocument()
    expect(screen.getByText('Zalo OA')).toBeInTheDocument()
  })

  it('render ở "/channels/zalo-oa" — accordion Zalo cũng tự mở (không chỉ riêng zalo-personal)', async () => {
    api.listStores.mockResolvedValue(THREE_DEMO_STORES)
    renderShellAt('/channels/zalo-oa')
    expect(await screen.findByText('Zalo cá nhân')).toBeInTheDocument()
    expect(screen.getByText('Zalo OA')).toBeInTheDocument()
  })

  it('bấm nút "Zalo" ở trang KHÔNG phải trang con Zalo (đang đóng) -> mở accordion ra, bấm lại -> đóng lại', async () => {
    api.listStores.mockResolvedValue(THREE_DEMO_STORES)
    renderShellAt('/')
    expect(screen.queryByText('Zalo cá nhân')).not.toBeInTheDocument()

    const zaloBtn = screen.getByRole('button', { name: /Zalo/ })
    await userEvent.click(zaloBtn)
    expect(await screen.findByText('Zalo cá nhân')).toBeInTheDocument()

    await userEvent.click(zaloBtn)
    expect(screen.queryByText('Zalo cá nhân')).not.toBeInTheDocument()
  })

  it('badge active=0 -> tone muted (Zalo OA: 0/3, cần mở accordion mới thấy — render sẵn ở trang con zalo-oa)', async () => {
    // Cả 3 store demo đều chưa bật Zalo OA -> active=0, total=3 -> muted.
    api.listStores.mockResolvedValue(THREE_DEMO_STORES)
    renderShellAt('/channels/zalo-oa')
    const oaBadge = await screen.findByTitle('0 đã kết nối / 3 cửa hàng · đang Beta')
    expect(oaBadge).toHaveTextContent('0/3')
    expect(oaBadge.className).toContain('bg-fg/[0.08]') // muted
  })

  it('badge active=total>0 -> tone emerald (Facebook: cả 3 store demo đều bật -> 3/3)', async () => {
    const allFbOn = THREE_DEMO_STORES.map((s) => ({
      ...s,
      channels: { ...s.channels, facebook: { enabled: true } },
    }))
    api.listStores.mockResolvedValue(allFbOn)
    renderShellAt('/')
    const fbBadgeAll = await screen.findByTitle('3 đã kết nối / 3 cửa hàng')
    expect(fbBadgeAll).toHaveTextContent('3/3')
    expect(fbBadgeAll.className).toContain('emerald')
  })
})

describe('AppShell — đầu vào sai: API /api/admin/stores lỗi', () => {
  it('listStores() reject -> KHÔNG crash, badge rơi về "0/0" (muted) thay vì treo mãi ở trạng thái loading', async () => {
    api.listStores.mockRejectedValue(new Error('Lỗi 502'))
    renderShellAt('/')
    const fbBadge = await screen.findByTitle('0 đã kết nối / 0 cửa hàng')
    expect(fbBadge).toHaveTextContent('0/0')
    // Vẫn render được sidebar + nội dung trang, không crash toàn app
    expect(screen.getByText('nội dung trang')).toBeInTheDocument()
  })
})
