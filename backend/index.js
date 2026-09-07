'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { TenantStore } = require('./src/db');
const { VectorStore } = require('./src/vectorstore');
const { EmbeddingClient, GeminiEmbeddingClient } = require('./src/embeddings');
const { LLMClient } = require('./src/llm');
const { RagService } = require('./src/rag');
const { createApp } = require('./src/app');

function createEmbeddingClient(provider) {
  if (provider === 'gemini') {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY env var is required when EMBEDDING_PROVIDER=gemini');
    }
    return new GeminiEmbeddingClient({ apiKey: geminiApiKey });
  }
  if (provider === 'openai') {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY env var is required when EMBEDDING_PROVIDER=openai (the default)');
    }
    return new EmbeddingClient({ apiKey: openaiApiKey });
  }
  throw new Error(`Unknown EMBEDDING_PROVIDER: "${provider}" (expected "openai" or "gemini")`);
}

function main() {
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterApiKey) {
    throw new Error('OPENROUTER_API_KEY env var is required');
  }

  const embeddingProvider = process.env.EMBEDDING_PROVIDER || 'openai';
  const embeddingClient = createEmbeddingClient(embeddingProvider);

  const sqlitePath = process.env.SQLITE_PATH || path.join(__dirname, 'data', 'tenants.db');
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  const tenantStore = new TenantStore(sqlitePath);
  const vectorStore = new VectorStore({ dbPath: process.env.LANCE_PATH || path.join(__dirname, 'data', 'vectors') });
  const llmClient = new LLMClient({
    apiKey: openrouterApiKey,
    model: process.env.LLM_MODEL || 'minimax/minimax-m3:free',
  });
  const ragService = new RagService({ tenantStore, vectorStore, embeddingClient, llmClient });

  const app = createApp({ tenantStore, vectorStore, embeddingClient, ragService, llmClient });
  const port = process.env.PORT || 4001;
  app.listen(port, () => {
    console.log(`backend: listening on port ${port} (embedding provider: ${embeddingProvider})`);
  });
}

main();
