'use strict';

const HISTORY_LIMIT = 6;

class RagService {
  constructor({ tenantStore, vectorStore, embeddingClient, llmClient }) {
    this.tenantStore = tenantStore;
    this.vectorStore = vectorStore;
    this.embeddingClient = embeddingClient;
    this.llmClient = llmClient;
  }

  async answer({ tenantId, conversationId, text, image }) {
    const tenant = this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new Error(`tenant not found: ${tenantId}`);
    }

    const [queryEmbedding] = await this.embeddingClient.embed([text]);
    const matches = await this.vectorStore.search(tenantId, queryEmbedding, 5);
    const context = matches.map((m) => m.text).join('\n\n');

    const history = this.tenantStore
      .getRecentMessages(tenantId, conversationId, HISTORY_LIMIT)
      .map((m) => ({ role: m.role, content: m.text }));

    const contextBlock = context
      ? `Thong tin tham khao:\n${context}\n\nCau hoi cua khach: ${text}`
      : text;

    const currentMessage = image
      ? {
          role: 'user',
          content: [
            { type: 'text', text: contextBlock },
            { type: 'image_url', image_url: { url: image } },
          ],
        }
      : { role: 'user', content: contextBlock };

    const reply = await this.llmClient.complete({
      systemPrompt: tenant.systemPrompt,
      messages: [...history, currentMessage],
    });

    this.tenantStore.addMessage({ tenantId, conversationId, role: 'user', text });
    this.tenantStore.addMessage({ tenantId, conversationId, role: 'assistant', text: reply });

    return { reply, attachments: this._attachmentsFor(matches) };
  }

  // Every retrieved chunk that points back at a real image/PDF page (page > 0) is worth
  // sending, not just the single best match -- a broad question like "menu" legitimately
  // pulls chunks from several pages, and text-only for the rest would be inconsistent
  // with a reply that already mentions their content. Deduped by docId+page (multiple
  // chunks commonly share a page) and capped at the vector search's own k, so this never
  // sends more images than chunks retrieved. A page-tagged chunk whose document was
  // deleted after indexing (stale vector row) is skipped rather than sending a broken
  // reference.
  _attachmentsFor(matches) {
    const seen = new Set();
    const attachments = [];
    for (const match of matches) {
      if (!match || !match.page) continue;
      const key = `${match.docId}#${match.page}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const doc = this.tenantStore.getDocument(match.docId);
      if (!doc) continue;
      const mimetype = doc.mimetype === 'application/pdf' ? 'image/png' : doc.mimetype;
      attachments.push({ docId: match.docId, page: match.page, mimetype });
    }
    return attachments;
  }
}

module.exports = { RagService };
