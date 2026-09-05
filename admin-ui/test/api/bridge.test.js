import { test, expect, vi } from 'vitest';
import { createBridgeClient } from '../../src/api/bridge';

test('listSessions GETs /sessions', async () => {
  const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ tenantId: 't1', status: 'logged_in' }] });
  const client = createBridgeClient({ baseUrl: 'http://bridge', fetchImpl });
  const result = await client.listSessions();
  expect(result).toEqual([{ tenantId: 't1', status: 'logged_in' }]);
  expect(fetchImpl).toHaveBeenCalledWith('http://bridge/sessions');
});

test('getQrStatus GETs the tenant qr-status endpoint', async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'awaiting_qr', qrUrl: '/tenants/t1/qr.png' }) });
  const client = createBridgeClient({ baseUrl: 'http://bridge', fetchImpl });
  const result = await client.getQrStatus('t1');
  expect(result).toEqual({ status: 'awaiting_qr', qrUrl: '/tenants/t1/qr.png' });
  expect(fetchImpl).toHaveBeenCalledWith('http://bridge/tenants/t1/qr-status');
});

test('getQrStatus returns status "unknown" for a 404 (bridge does not know this tenant yet)', async () => {
  const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });
  const client = createBridgeClient({ baseUrl: 'http://bridge', fetchImpl });
  const result = await client.getQrStatus('brand-new-tenant');
  expect(result).toEqual({ status: 'unknown' });
});

test('getQrStatus throws on other non-ok statuses', async () => {
  const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
  const client = createBridgeClient({ baseUrl: 'http://bridge', fetchImpl });
  await expect(client.getQrStatus('t1')).rejects.toThrow('getQrStatus failed with status 500');
});

test('exposes baseUrl for building the QR image URL', () => {
  const client = createBridgeClient({ baseUrl: 'http://bridge' });
  expect(client.baseUrl).toBe('http://bridge');
});
