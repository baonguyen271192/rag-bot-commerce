'use strict';

const path = require('node:path');
const { TenantStore } = require('./src/db');
const { VectorStore } = require('./src/vectorstore');
const { EmbeddingClient } = require('./src/embeddings');
const { LLMClient } = require('./src/llm');
const { RagService } = require('./src/rag');
const { createApp } = require('./src/app');

function main() {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openaiApiKey || !openrouterApiKey) {
    throw new Error('OPENAI_API_KEY and OPENROUTER_API_KEY env vars are required');
  }

  const tenantStore = new TenantStore(process.env.SQLITE_PATH || path.join(__dirname, 'data', 'tenants.db'));
  const vectorStore = new VectorStore({ dbPath: process.env.LANCE_PATH || path.join(__dirname, 'data', 'vectors') });
  const embeddingClient = new EmbeddingClient({ apiKey: openaiApiKey });
  const llmClient = new LLMClient({
    apiKey: openrouterApiKey,
    model: process.env.LLM_MODEL || 'minimax/minimax-m3:free',
  });
  const ragService = new RagService({ tenantStore, vectorStore, embeddingClient, llmClient });

  const app = createApp({ tenantStore, vectorStore, embeddingClient, ragService });
  const port = process.env.PORT || 4001;
  app.listen(port, () => {
    console.log(`backend: listening on port ${port}`);
  });
}

main();
