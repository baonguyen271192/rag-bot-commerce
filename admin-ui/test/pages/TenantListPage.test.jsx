import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TenantListPage from '../../src/pages/TenantListPage';
import { ClientsContext } from '../../src/clients-context';

afterEach(cleanup);

function renderPage(backendClient, bridgeClient) {
  return render(
    <ClientsContext.Provider value={{ backendClient, bridgeClient }}>
      <MemoryRouter>
        <TenantListPage />
      </MemoryRouter>
    </ClientsContext.Provider>
  );
}

test('renders tenants merged with their Zalo login status', async () => {
  const backendClient = { listTenants: vi.fn().mockResolvedValue([{ id: 't1', name: 'Truc Lam Vien' }]) };
  const bridgeClient = { listSessions: vi.fn().mockResolvedValue([{ tenantId: 't1', status: 'logged_in' }]) };

  renderPage(backendClient, bridgeClient);

  await waitFor(() => expect(screen.getByText('Truc Lam Vien')).toBeInTheDocument());
  expect(screen.getByText('Đã đăng nhập')).toBeInTheDocument();
});

test('shows "unknown" status when bridge has no entry for a tenant yet', async () => {
  const backendClient = { listTenants: vi.fn().mockResolvedValue([{ id: 't1', name: 'New Tenant' }]) };
  const bridgeClient = { listSessions: vi.fn().mockResolvedValue([]) };

  renderPage(backendClient, bridgeClient);

  await waitFor(() => expect(screen.getByText('New Tenant')).toBeInTheDocument());
  expect(screen.getByText('Chưa kết nối')).toBeInTheDocument();
});

test('still shows tenants when bridge is unreachable', async () => {
  const backendClient = { listTenants: vi.fn().mockResolvedValue([{ id: 't1', name: 'Truc Lam Vien' }]) };
  const bridgeClient = { listSessions: vi.fn().mockRejectedValue(new Error('bridge down')) };

  renderPage(backendClient, bridgeClient);

  await waitFor(() => expect(screen.getByText('Truc Lam Vien')).toBeInTheDocument());
  expect(screen.getByText('Chưa kết nối')).toBeInTheDocument();
});

test('shows an error message when the backend itself fails', async () => {
  const backendClient = { listTenants: vi.fn().mockRejectedValue(new Error('network error')) };
  const bridgeClient = { listSessions: vi.fn().mockResolvedValue([]) };

  renderPage(backendClient, bridgeClient);

  await waitFor(() => expect(screen.getByText(/network error/)).toBeInTheDocument());
});

test('shows a message when there are no tenants yet', async () => {
  const backendClient = { listTenants: vi.fn().mockResolvedValue([]) };
  const bridgeClient = { listSessions: vi.fn().mockResolvedValue([]) };

  renderPage(backendClient, bridgeClient);

  await waitFor(() => expect(screen.getByText('Chưa có tenant nào')).toBeInTheDocument());
});
