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
    const body = { conversationId, text };
    if (image) body.image = image;
    const res = await this.fetch(`${this.baseUrl}/tenants/${tenantId}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`ask failed with status ${res.status}`);
    }
    const data = await res.json();
    return { reply: data.reply, attachment: data.attachment || null };
  }

  async downloadDocumentImage(tenantId, docId, page) {
    const url = new URL(`${this.baseUrl}/tenants/${tenantId}/documents/${docId}/image`);
    if (page) url.searchParams.set('page', page);
    const res = await this.fetch(url.toString());
    if (!res.ok) {
      throw new Error(`downloadDocumentImage failed with status ${res.status}`);
    }
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await res.arrayBuffer());
    return { data: buffer, contentType };
  }
}

module.exports = { BackendClient };
