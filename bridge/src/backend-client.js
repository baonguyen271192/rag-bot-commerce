'use strict';

class BackendClient {
  constructor({ baseUrl, fetchImpl = fetch }) {
    this.baseUrl = baseUrl;
    this.fetch = fetchImpl;
  }

  async listTenants() {
    const res = await this.fetch(`${this.baseUrl}/tenants`);
    if (!res.ok) {
      throw new Error(`listTenants failed with status ${res.status}`);
    }
    return res.json();
  }

  async ask(tenantId, { conversationId, text, image }) {
    const res = await this.fetch(`${this.baseUrl}/tenants/${tenantId}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, text, image }),
    });
    if (!res.ok) {
      throw new Error(`ask failed with status ${res.status}`);
    }
    const data = await res.json();
    return data.reply;
  }
}

module.exports = { BackendClient };
