'use strict';

class EmbeddingClient {
  constructor({ apiKey, model = 'text-embedding-3-small', fetchImpl = fetch }) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetch = fetchImpl;
  }

  async embed(texts) {
    if (texts.length === 0) return [];
    const res = await this.fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) {
      const detail = res.text ? await res.text() : '';
      throw new Error(`OpenAI embeddings request failed with status ${res.status}: ${detail}`);
    }
    const data = await res.json();
    const sorted = [...data.data].sort((a, b) => a.index - b.index);
    return sorted.map((item) => item.embedding);
  }
}

class GeminiEmbeddingClient {
  constructor({ apiKey, model = 'gemini-embedding-001', fetchImpl = fetch }) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetch = fetchImpl;
  }

  async embed(texts) {
    if (texts.length === 0) return [];
    const res = await this.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:batchEmbedContents`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: `models/${this.model}`,
            content: { parts: [{ text }] },
          })),
        }),
      }
    );
    if (!res.ok) {
      const detail = res.text ? await res.text() : '';
      throw new Error(`Gemini embeddings request failed with status ${res.status}: ${detail}`);
    }
    const data = await res.json();
    return data.embeddings.map((item) => item.values);
  }
}

module.exports = { EmbeddingClient, GeminiEmbeddingClient };
