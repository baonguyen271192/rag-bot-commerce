import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import StoreSwitcher from '../../src/components/StoreSwitcher'

// 3 store mẫu — 1 builtin không owner_email (giống 3 cửa hàng demo default/shop2/chao
// thật, xem CLAUDE.md phần commerce/app/stores.py).
const STORES = [
  { id: 'default', name: 'Default', owner_email: null },
  { id: 'shop2', name: 'Shop2', owner_email: 'shop2@example.com' },
  { id: 'chao', name: 'Chao', owner_email: 'chao@example.com' },
]

function renderAt(path, props) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <StoreSwitcher {...props} />
    </MemoryRouter>,
  )
}

describe('StoreSwitcher — đường chạy thuận lợi', () => {
  it('admin, activeStoreId=shop2 -> hiện tên + email chủ; bấm nút -> dropdown hiện các cửa hàng còn lại', async () => {
    renderAt('/stores/shop2/config', { stores: STORES, activeStoreId: 'shop2' })
    expect(screen.getByText('Shop2')).toBeInTheDocument()
    expect(screen.getByText('shop2@example.com')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Chuyển cửa hàng' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem')).toHaveLength(3)
  })

  it('dòng cửa hàng khác có href = /stores/<id>/<section đang xem> (giữ nguyên section)', async () => {
    renderAt('/stores/shop2/orders', { stores: STORES, activeStoreId: 'shop2' })
    await userEvent.click(screen.getByRole('button', { name: 'Chuyển cửa hàng' }))
    const defaultLink = screen.getByRole('menuitem', { name: /Default/ })
    expect(defaultLink).toHaveAttribute('href', '/stores/default/orders')
  })
})

describe('StoreSwitcher — trường hợp biên', () => {
  it("activeStoreId = null -> hiện 'Chọn cửa hàng', vẫn mở dropdown được", async () => {
    renderAt('/', { stores: STORES, activeStoreId: null })
    expect(screen.getByText('Chọn cửa hàng')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Chuyển cửa hàng' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it("activeStoreId='da-bi-xoa' (không có trong stores) -> hiện placeholder, không crash", () => {
    renderAt('/', { stores: STORES, activeStoreId: 'da-bi-xoa' })
    expect(screen.getByText('Chọn cửa hàng')).toBeInTheDocument()
  })

  it("store không có owner_email -> hiện 'Không có chủ sở hữu', KHÔNG hiện chuỗi 'undefined'", () => {
    renderAt('/stores/default/config', { stores: STORES, activeStoreId: 'default' })
    expect(screen.getByText('Không có chủ sở hữu')).toBeInTheDocument()
    expect(screen.queryByText('undefined')).not.toBeInTheDocument()
  })

  it('bấm Escape khi đang mở -> dropdown đóng', async () => {
    renderAt('/', { stores: STORES, activeStoreId: 'shop2' })
    await userEvent.click(screen.getByRole('button', { name: 'Chuyển cửa hàng' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('portal -> KHÔNG có button mở dropdown, chỉ hiện tên cửa hàng', async () => {
    // IS_PORTAL được tính 1 LẦN lúc import từ window.location.pathname — không thể đổi
    // bằng cách gán lại window.location sau khi module đã import. Mock thẳng module
    // lib/console rồi import động lại component để lấy 1 bản mới dùng IS_PORTAL=true,
    // không ảnh hưởng tới các test khác trong file (vẫn dùng bản import tĩnh ở đầu file).
    vi.resetModules()
    vi.doMock('../../src/lib/console', () => ({
      IS_PORTAL: true,
      EXPECTED_ROLE: 'tenant_owner',
      CONSOLE_PREFIX: '/portal',
      OTHER_PREFIX: '/admin',
      ADMIN_PREFIX: '/admin',
      PORTAL_PREFIX: '/portal',
    }))
    const { default: PortalStoreSwitcher } = await import('../../src/components/StoreSwitcher')

    render(
      <MemoryRouter initialEntries={['/stores/shop2/config']}>
        <PortalStoreSwitcher stores={STORES} activeStoreId="shop2" />
      </MemoryRouter>,
    )
    expect(screen.getByText('Shop2')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Chuyển cửa hàng/ })).not.toBeInTheDocument()

    vi.doUnmock('../../src/lib/console')
    vi.resetModules()
  })
})

// Các ca dưới đây ứng với mục "Trường hợp biên" #13, #14, #15 của kế hoạch — được nêu
// tên trong kế hoạch nhưng KHÔNG nằm trong danh sách 9 ca chi tiết ở mục "Test" nên chưa
// có test tương ứng; bổ sung ở đây (không sửa lại các `it` đã có sẵn của Coder).
describe('StoreSwitcher — trường hợp biên bổ sung (#13-#15 kế hoạch)', () => {
  it('chọn 1 dòng trong dropdown -> gọi onNavigate (để AppShell đóng drawer mobile, ca #13)', async () => {
    const onNavigate = vi.fn()
    renderAt('/stores/shop2/orders', { stores: STORES, activeStoreId: 'shop2', onNavigate })
    await userEvent.click(screen.getByRole('button', { name: 'Chuyển cửa hàng' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Default/ }))
    expect(onNavigate).toHaveBeenCalledTimes(1)
  })

  it('bấm Escape khi đang mở -> đóng dropdown VÀ trả focus về nút switcher (ca #14)', async () => {
    renderAt('/', { stores: STORES, activeStoreId: 'shop2' })
    const button = screen.getByRole('button', { name: 'Chuyển cửa hàng' })
    await userEvent.click(button)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('admin chỉ có đúng 1 cửa hàng -> dropdown vẫn mở được, đúng 1 dòng, KHÔNG tự redirect (ca #15)', async () => {
    const single = [{ id: 'default', name: 'Default', owner_email: null }]
    renderAt('/stores/default/config', { stores: single, activeStoreId: 'default' })
    // Không tự ẩn switcher, không tự điều hướng đi đâu — vẫn là 1 nút bấm được.
    const button = screen.getByRole('button', { name: 'Chuyển cửa hàng' })
    await userEvent.click(button)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem')).toHaveLength(1)
  })
})

describe('StoreSwitcher — đầu vào sai', () => {
  it('stores = null (đang tải) -> không crash, KHÔNG render link nào', () => {
    renderAt('/', { stores: null, activeStoreId: null })
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.queryByText('undefined')).not.toBeInTheDocument()
  })

  it('stores = [] (API lỗi) -> hiện placeholder, dropdown rỗng có thông báo, không crash', async () => {
    renderAt('/', { stores: [], activeStoreId: null })
    expect(screen.getByText('Chọn cửa hàng')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Chuyển cửa hàng' }))
    expect(screen.getByText('Chưa có cửa hàng nào')).toBeInTheDocument()
  })
})
