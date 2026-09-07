import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TenantDetailPage from '../../src/pages/TenantDetailPage';
import { ClientsContext } from '../../src/clients-context';

afterEach(cleanup);

function renderPage(backendClient, bridgeClient) {
  return render(
    <ClientsContext.Provider value={{ backendClient, bridgeClient }}>
      <MemoryRouter initialEntries={['/tenants/t1']}>
        <Routes>
          <Route path="/tenants/:id" element={<TenantDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ClientsContext.Provider>
  );
}

function makeBackendClient(overrides = {}) {
  return {
    getTenant: vi.fn().mockResolvedValue({ id: 't1', name: 'Truc Lam Vien', systemPrompt: 'Ban la tro ly.' }),
    listDocuments: vi.fn().mockResolvedValue([]),
    updateSystemPrompt: vi.fn().mockResolvedValue({ ok: true }),
    uploadDocument: vi.fn().mockResolvedValue({ docId: 'menu.md_1', chunkCount: 2 }),
    deleteDocument: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeBridgeClient(overrides = {}) {
  return {
    baseUrl: 'http://bridge.local',
    getQrStatus: vi.fn().mockResolvedValue({ status: 'unknown' }),
    ...overrides,
  };
}

test('loads and displays the tenant name, system prompt, and document list', async () => {
  const backendClient = makeBackendClient({
    listDocuments: vi
      .fn()
      .mockResolvedValue([{ id: 'd1', filename: 'menu.md', chunkCount: 3, createdAt: '2026-01-01' }]),
  });
  renderPage(backendClient, makeBridgeClient());

  expect(await screen.findByText('Truc Lam Vien')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Ban la tro ly.')).toBeInTheDocument();
  expect(await screen.findByText(/menu\.md/)).toBeInTheDocument();
});

test('saves the system prompt', async () => {
  const user = userEvent.setup();
  const backendClient = makeBackendClient();
  renderPage(backendClient, makeBridgeClient());

  await screen.findByText('Truc Lam Vien');
  const textarea = screen.getByLabelText('System prompt', { selector: 'textarea' });
  await user.clear(textarea);
  await user.type(textarea, 'Prompt moi');
  await user.click(screen.getByRole('button', { name: 'Lưu' }));

  await waitFor(() => expect(backendClient.updateSystemPrompt).toHaveBeenCalledWith('t1', 'Prompt moi'));
  expect(await screen.findByText('Đã lưu.')).toBeInTheDocument();
});

test('shows an error when saving the system prompt fails', async () => {
  const user = userEvent.setup();
  const backendClient = makeBackendClient({
    updateSystemPrompt: vi.fn().mockRejectedValue(new Error('tenant not found')),
  });
  renderPage(backendClient, makeBridgeClient());

  await screen.findByText('Truc Lam Vien');
  await user.click(screen.getByRole('button', { name: 'Lưu' }));

  expect(await screen.findByText('tenant not found')).toBeInTheDocument();
});

test('uploads a file selected via the file input and refreshes the document list', async () => {
  const listDocuments = vi
    .fn()
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ id: 'd1', filename: 'menu.md', chunkCount: 2, createdAt: '2026-01-01' }]);
  const backendClient = makeBackendClient({ listDocuments });
  renderPage(backendClient, makeBridgeClient());

  await screen.findByText('Truc Lam Vien');
  const file = new File(['## Menu'], 'menu.md', { type: 'text/markdown' });
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [file] } });

  await waitFor(() => expect(backendClient.uploadDocument).toHaveBeenCalledWith('t1', file));
  expect(await screen.findByText(/menu\.md/)).toBeInTheDocument();
});

test('rejects an unsupported file extension without calling the upload API', async () => {
  const backendClient = makeBackendClient();
  renderPage(backendClient, makeBridgeClient());

  await screen.findByText('Truc Lam Vien');
  const file = new File(['data'], 'video.mp4', { type: 'video/mp4' });
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [file] } });

  expect(await screen.findByText(/Định dạng không hỗ trợ/)).toBeInTheDocument();
  expect(backendClient.uploadDocument).not.toHaveBeenCalled();
});

test('deletes a document after confirming, and refreshes the list', async () => {
  const user = userEvent.setup();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const listDocuments = vi
    .fn()
    .mockResolvedValueOnce([{ id: 'd1', filename: 'menu.md', chunkCount: 2, createdAt: '2026-01-01' }])
    .mockResolvedValueOnce([]);
  const backendClient = makeBackendClient({ listDocuments });
  renderPage(backendClient, makeBridgeClient());

  await screen.findByText(/menu\.md/);
  await user.click(screen.getByRole('button', { name: 'Xoá' }));

  await waitFor(() => expect(backendClient.deleteDocument).toHaveBeenCalledWith('t1', 'd1'));
  await waitFor(() => expect(screen.queryByText(/menu\.md/)).not.toBeInTheDocument());
  window.confirm.mockRestore();
});

test('does not delete a document when the confirmation is cancelled', async () => {
  const user = userEvent.setup();
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  const backendClient = makeBackendClient({
    listDocuments: vi
      .fn()
      .mockResolvedValue([{ id: 'd1', filename: 'menu.md', chunkCount: 2, createdAt: '2026-01-01' }]),
  });
  renderPage(backendClient, makeBridgeClient());

  await screen.findByText(/menu\.md/);
  await user.click(screen.getByRole('button', { name: 'Xoá' }));

  expect(backendClient.deleteDocument).not.toHaveBeenCalled();
  window.confirm.mockRestore();
});

test('shows an error when deleting a document fails', async () => {
  const user = userEvent.setup();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const backendClient = makeBackendClient({
    listDocuments: vi
      .fn()
      .mockResolvedValue([{ id: 'd1', filename: 'menu.md', chunkCount: 2, createdAt: '2026-01-01' }]),
    deleteDocument: vi.fn().mockRejectedValue(new Error('delete failed')),
  });
  renderPage(backendClient, makeBridgeClient());

  await screen.findByText(/menu\.md/);
  await user.click(screen.getByRole('button', { name: 'Xoá' }));

  expect(await screen.findByText('delete failed')).toBeInTheDocument();
  window.confirm.mockRestore();
});

test('shows the QR image when the tenant is awaiting a scan', async () => {
  const backendClient = makeBackendClient();
  const bridgeClient = makeBridgeClient({
    getQrStatus: vi.fn().mockResolvedValue({ status: 'awaiting_qr', qrUrl: '/tenants/t1/qr.png' }),
  });
  renderPage(backendClient, bridgeClient);

  const img = await screen.findByAltText('QR đăng nhập Zalo');
  expect(img.src).toContain('http://bridge.local/tenants/t1/qr.png');
});

test('logs out after confirming, when the tenant is logged in', async () => {
  const user = userEvent.setup();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const backendClient = makeBackendClient();
  const logout = vi.fn().mockResolvedValue({ ok: true });
  const bridgeClient = makeBridgeClient({
    getQrStatus: vi.fn().mockResolvedValue({ status: 'logged_in' }),
    logout,
  });
  renderPage(backendClient, bridgeClient);

  await user.click(await screen.findByRole('button', { name: 'Đăng xuất' }));

  expect(logout).toHaveBeenCalledWith('t1');
  window.confirm.mockRestore();
});

test('does not log out when the confirmation is cancelled', async () => {
  const user = userEvent.setup();
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  const backendClient = makeBackendClient();
  const logout = vi.fn();
  const bridgeClient = makeBridgeClient({
    getQrStatus: vi.fn().mockResolvedValue({ status: 'logged_in' }),
    logout,
  });
  renderPage(backendClient, bridgeClient);

  await user.click(await screen.findByRole('button', { name: 'Đăng xuất' }));

  expect(logout).not.toHaveBeenCalled();
  window.confirm.mockRestore();
});

test('shows an error when logout fails', async () => {
  const user = userEvent.setup();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const backendClient = makeBackendClient();
  const bridgeClient = makeBridgeClient({
    getQrStatus: vi.fn().mockResolvedValue({ status: 'logged_in' }),
    logout: vi.fn().mockRejectedValue(new Error('tenant not connected')),
  });
  renderPage(backendClient, bridgeClient);

  await user.click(await screen.findByRole('button', { name: 'Đăng xuất' }));

  expect(await screen.findByText('tenant not connected')).toBeInTheDocument();
  window.confirm.mockRestore();
});

test('shows a message explaining the bridge does not know about this tenant yet', async () => {
  const backendClient = makeBackendClient();
  renderPage(backendClient, makeBridgeClient());

  expect(await screen.findByText(/Chưa kết nối với bridge/)).toBeInTheDocument();
});

test('the upload drop zone is keyboard-operable (Enter opens the file picker)', async () => {
  const backendClient = makeBackendClient();
  renderPage(backendClient, makeBridgeClient());

  await screen.findByText('Truc Lam Vien');
  const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
  const dropZone = screen.getByRole('button', { name: 'Chọn hoặc kéo-thả file tài liệu để upload' });

  dropZone.focus();
  fireEvent.keyDown(dropZone, { key: 'Enter' });

  expect(clickSpy).toHaveBeenCalled();
  clickSpy.mockRestore();
});
