export function createBridgeClient({ baseUrl, fetchImpl = fetch } = {}) {
  return {
    baseUrl,

    async listSessions() {
      const res = await fetchImpl(`${baseUrl}/sessions`);
      if (!res.ok) throw new Error(`listSessions failed with status ${res.status}`);
      return res.json();
    },

    async getQrStatus(tenantId) {
      const res = await fetchImpl(`${baseUrl}/tenants/${tenantId}/qr-status`);
      if (res.status === 404) return { status: 'unknown' };
      if (!res.ok) throw new Error(`getQrStatus failed with status ${res.status}`);
      return res.json();
    },
  };
}
