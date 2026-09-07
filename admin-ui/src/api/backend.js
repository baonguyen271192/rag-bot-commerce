export function createBackendClient({ baseUrl, fetchImpl = fetch } = {}) {
  return {
    baseUrl,

    async listTenants() {
      const res = await fetchImpl(`${baseUrl}/tenants`);
      if (!res.ok) throw new Error(`listTenants failed with status ${res.status}`);
      return res.json();
    },

    async createTenant({ id, name, systemPrompt }) {
      const res = await fetchImpl(`${baseUrl}/tenants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, systemPrompt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `createTenant failed with status ${res.status}`);
      return data;
    },

    async getTenant(id) {
      const res = await fetchImpl(`${baseUrl}/tenants/${id}`);
      if (!res.ok) throw new Error(`getTenant failed with status ${res.status}`);
      return res.json();
    },

    async updateSystemPrompt(id, systemPrompt) {
      const res = await fetchImpl(`${baseUrl}/tenants/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `updateSystemPrompt failed with status ${res.status}`);
      return data;
    },

    async listDocuments(tenantId) {
      const res = await fetchImpl(`${baseUrl}/tenants/${tenantId}/documents`);
      if (!res.ok) throw new Error(`listDocuments failed with status ${res.status}`);
      return res.json();
    },

    async uploadDocument(tenantId, file) {
      const form = new FormData();
      form.append('file', file);
      const res = await fetchImpl(`${baseUrl}/tenants/${tenantId}/documents`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `uploadDocument failed with status ${res.status}`);
      return data;
    },

    async deleteDocument(tenantId, docId) {
      const res = await fetchImpl(`${baseUrl}/tenants/${tenantId}/documents/${docId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error(`deleteDocument failed with status ${res.status}`);
    },
  };
}
