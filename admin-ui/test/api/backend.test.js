import { test, expect, vi } from 'vitest';
import { createBackendClient } from '../../src/api/backend';

function fetchOk(jsonValue, status = 200) {
  return vi.fn().mockResolvedValue({ ok: true, status, json: async () => jsonValue });
}

test('listTenants GETs /tenants', async () => {
  const fetchImpl = fetchOk([{ id: 't1' }]);
  const client = createBackendClient({ baseUrl: 'http://x', fetchImpl });
  const result = await client.listTenants();
  expect(result).toEqual([{ id: 't1' }]);
  expect(fetchImpl).toHaveBeenCalledWith('http://x/tenants');
});

test('createTenant POSTs the tenant payload', async () => {
  const fetchImpl = fetchOk({ id: 't1' }, 201);
  const client = createBackendClient({ baseUrl: 'http://x', fetchImpl });
  await client.createTenant({ id: 't1', name: 'A', systemPrompt: 'p' });
  expect(fetchImpl).toHaveBeenCalledWith('http://x/tenants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 't1', name: 'A', systemPrompt: 'p' }),
  });
});

test('createTenant throws the backend error message on failure', async () => {
  const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'id invalid' }) });
  const client = createBackendClient({ baseUrl: 'http://x', fetchImpl });
  await expect(client.createTenant({ id: 'Bad', name: 'A', systemPrompt: 'p' })).rejects.toThrow('id invalid');
});

test('getTenant GETs /tenants/:id', async () => {
  const fetchImpl = fetchOk({ id: 't1', name: 'A' });
  const client = createBackendClient({ baseUrl: 'http://x', fetchImpl });
  const result = await client.getTenant('t1');
  expect(result).toEqual({ id: 't1', name: 'A' });
  expect(fetchImpl).toHaveBeenCalledWith('http://x/tenants/t1');
});

test('updateSystemPrompt PUTs the new prompt', async () => {
  const fetchImpl = fetchOk({ ok: true });
  const client = createBackendClient({ baseUrl: 'http://x', fetchImpl });
  await client.updateSystemPrompt('t1', 'new prompt');
  expect(fetchImpl).toHaveBeenCalledWith('http://x/tenants/t1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemPrompt: 'new prompt' }),
  });
});

test('listDocuments GETs /tenants/:id/documents', async () => {
  const fetchImpl = fetchOk([{ id: 'd1' }]);
  const client = createBackendClient({ baseUrl: 'http://x', fetchImpl });
  const result = await client.listDocuments('t1');
  expect(result).toEqual([{ id: 'd1' }]);
  expect(fetchImpl).toHaveBeenCalledWith('http://x/tenants/t1/documents');
});

test('uploadDocument POSTs a multipart form with the file', async () => {
  const fetchImpl = fetchOk({ docId: 'd1', chunkCount: 2 }, 201);
  const client = createBackendClient({ baseUrl: 'http://x', fetchImpl });
  const file = new File(['content'], 'a.md');
  await client.uploadDocument('t1', file);
  const [url, opts] = fetchImpl.mock.calls[0];
  expect(url).toBe('http://x/tenants/t1/documents');
  expect(opts.method).toBe('POST');
  expect(opts.body).toBeInstanceOf(FormData);
  expect(opts.body.get('file')).toBe(file);
});

test('uploadDocument throws the backend error message on failure', async () => {
  const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ error: 'khong doc duoc anh' }) });
  const client = createBackendClient({ baseUrl: 'http://x', fetchImpl });
  await expect(client.uploadDocument('t1', new File(['x'], 'a.jpg'))).rejects.toThrow('khong doc duoc anh');
});

test('deleteDocument DELETEs the document', async () => {
  const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 204 });
  const client = createBackendClient({ baseUrl: 'http://x', fetchImpl });
  await client.deleteDocument('t1', 'd1');
  expect(fetchImpl).toHaveBeenCalledWith('http://x/tenants/t1/documents/d1', { method: 'DELETE' });
});
