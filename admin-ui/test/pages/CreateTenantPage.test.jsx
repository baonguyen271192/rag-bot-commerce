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

test('navigates to the tenant detail page after successful creation', async () => {
  const user = userEvent.setup();
  const backendClient = { createTenant: vi.fn().mockResolvedValue({ id: 't1' }) };
  renderPage(backendClient);

  await user.type(screen.getByLabelText('Mã tenant (id)'), 't1');
  await user.type(screen.getByLabelText('Tên nhà hàng'), 'Truc Lam Vien');
  await user.type(screen.getByLabelText('System prompt ban đầu'), 'Ban la tro ly.');
  await user.click(screen.getByRole('button', { name: /Tạo tenant/ }));

  expect(await screen.findByText('Trang chi tiet tenant')).toBeInTheDocument();
  expect(backendClient.createTenant).toHaveBeenCalledWith({
    id: 't1',
    name: 'Truc Lam Vien',
    systemPrompt: 'Ban la tro ly.',
  });
});

test('shows a validation error for an invalid id and disables submit', async () => {
  const user = userEvent.setup();
  const backendClient = { createTenant: vi.fn() };
  renderPage(backendClient);

  await user.type(screen.getByLabelText('Mã tenant (id)'), 'Invalid ID!');

  expect(screen.getByText(/Chỉ dùng chữ thường/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Tạo tenant/ })).toBeDisabled();
  expect(backendClient.createTenant).not.toHaveBeenCalled();
});

test('shows the backend error message on failure', async () => {
  const user = userEvent.setup();
  const backendClient = { createTenant: vi.fn().mockRejectedValue(new Error('id already exists')) };
  renderPage(backendClient);

  await user.type(screen.getByLabelText('Mã tenant (id)'), 't1');
  await user.type(screen.getByLabelText('Tên nhà hàng'), 'A');
  await user.type(screen.getByLabelText('System prompt ban đầu'), 'p');
  await user.click(screen.getByRole('button', { name: /Tạo tenant/ }));

  expect(await screen.findByText('id already exists')).toBeInTheDocument();
});
