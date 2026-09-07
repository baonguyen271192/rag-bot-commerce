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

    return { reply, attachment: this._attachmentFor(matches[0]) };
  }

  // The single best-matching chunk points back at the original image/PDF page it came
  // from (page > 0), if any -- that's the one image worth sending back with the reply.
  // A page-tagged chunk whose document was deleted after indexing (stale vector row) is
  // treated the same as no attachment, rather than sending a broken reference.
  _attachmentFor(topMatch) {
    if (!topMatch || !topMatch.page) return null;
    const doc = this.tenantStore.getDocument(topMatch.docId);
    if (!doc) return null;
    const mimetype = doc.mimetype === 'application/pdf' ? 'image/png' : doc.mimetype;
    return { docId: topMatch.docId, page: topMatch.page, mimetype };
  }
}

module.exports = { RagService };
