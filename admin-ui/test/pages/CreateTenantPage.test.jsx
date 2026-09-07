import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CreateTenantPage from '../../src/pages/CreateTenantPage';
import { ClientsContext } from '../../src/clients-context';

afterEach(cleanup);

function renderPage(backendClient) {
  return render(
    <ClientsContext.Provider value={{ backendClient, bridgeClient: {} }}>
      <MemoryRouter initialEntries={['/tenants/new']}>
        <Routes>
          <Route path="/tenants/new" element={<CreateTenantPage />} />
          <Route path="/tenants/:id" element={<div>Trang chi tiet tenant</div>} />
        </Routes>
      </MemoryRouter>
    </ClientsContext.Provider>
  );
}

test('auto-generates the id from the name, and navigates to the tenant detail page after successful creation', async () => {
  const user = userEvent.setup();
  const backendClient = { createTenant: vi.fn().mockResolvedValue({ id: 'ca-phe-binh-minh' }) };
  renderPage(backendClient);

  await user.type(screen.getByLabelText('Tên cửa hàng / doanh nghiệp'), 'Cà Phê Bình Minh');
  await user.type(screen.getByLabelText('Vai trò & giọng điệu của bot'), 'Ban la tro ly.');

  expect(screen.getByLabelText('Mã định danh')).toHaveValue('ca-phe-binh-minh');

  await user.click(screen.getByRole('button', { name: /Tạo cửa hàng/ }));

  expect(await screen.findByText('Trang chi tiet tenant')).toBeInTheDocument();
  expect(backendClient.createTenant).toHaveBeenCalledWith({
    id: 'ca-phe-binh-minh',
    name: 'Cà Phê Bình Minh',
    systemPrompt: 'Ban la tro ly.',
  });
});

test('lets the operator manually override the auto-generated id', async () => {
  const user = userEvent.setup();
  const backendClient = { createTenant: vi.fn().mockResolvedValue({ id: 'custom-id' }) };
  renderPage(backendClient);

  await user.type(screen.getByLabelText('Tên cửa hàng / doanh nghiệp'), 'Cà Phê Bình Minh');
  await user.type(screen.getByLabelText('Vai trò & giọng điệu của bot'), 'p');
  const idField = screen.getByLabelText('Mã định danh');
  await user.clear(idField);
  await user.type(idField, 'custom-id');

  await user.click(screen.getByRole('button', { name: /Tạo cửa hàng/ }));

  expect(backendClient.createTenant).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'custom-id', name: 'Cà Phê Bình Minh' })
  );
});

test('shows a validation error for an invalid id and disables submit', async () => {
  const user = userEvent.setup();
  const backendClient = { createTenant: vi.fn() };
  renderPage(backendClient);

  await user.type(screen.getByLabelText('Mã định danh'), 'Invalid ID!');

  expect(screen.getByText(/Chỉ dùng chữ thường/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Tạo cửa hàng/ })).toBeDisabled();
  expect(backendClient.createTenant).not.toHaveBeenCalled();
});

test('shows the backend error message on failure', async () => {
  const user = userEvent.setup();
  const backendClient = { createTenant: vi.fn().mockRejectedValue(new Error('id already exists')) };
  renderPage(backendClient);

  await user.type(screen.getByLabelText('Tên cửa hàng / doanh nghiệp'), 'A');
  await user.type(screen.getByLabelText('Vai trò & giọng điệu của bot'), 'p');
  await user.click(screen.getByRole('button', { name: /Tạo cửa hàng/ }));

  expect(await screen.findByText('id already exists')).toBeInTheDocument();
});
