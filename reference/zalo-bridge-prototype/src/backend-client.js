'use strict';

function parseSSE(raw) {
  const blocks = raw
    .replace(/\r\n/g, '\n')
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
  const events = [];
  for (const block of blocks) {
    let eventName = null;
    const dataLines = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) {
        eventName = line.replace(/^event: ?/, '').trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.replace(/^data: ?/, ''));
      }
    }
    if (!eventName || dataLines.length === 0) continue;
    let data;
    try {
      data = JSON.parse(dataLines.join('\n'));
    } catch {
      continue;
    }
    events.push({ event: eventName, data });
  }
  return events;
}

function aggregateSSE(raw) {
  const events = parseSSE(raw);
  let assistantText = null;
  let deltaBuffer = '';
  for (const { event, data } of events) {
    if (event === 'message/full' && data && data.content && data.content.role === 'assistant') {
      assistantText = data.content.payload && data.content.payload.text ? data.content.payload.text : null;
    } else if (event === 'text/delta' && typeof data.content === 'string') {
      deltaBuffer += data.content;
    }
  }
  if (assistantText) return assistantText;
  if (deltaBuffer) return deltaBuffer;
  return null;
}

class BackendClient {
  constructor({ baseUrl, serviceApiKey, agentName, fetchImpl = fetch }) {
    this.baseUrl = baseUrl;
    this.serviceApiKey = serviceApiKey;
    this.agentName = agentName;
    this.fetch = fetchImpl;
  }

  async createThread() {
    const res = await this.fetch(`${this.baseUrl}/api/v1/threads`, {
      method: 'POST',
      headers: { 'X-Service-Api-Key': this.serviceApiKey },
    });
    if (!res.ok) {
      throw new Error(`createThread failed with status ${res.status}`);
    }
    const data = await res.json();
    return data.id;
  }

  async runSync(threadId, text) {
    const form = new FormData();
    form.append('text', text);
    form.append('agent_name', this.agentName);
    const res = await this.fetch(`${this.baseUrl}/api/v1/threads/${threadId}/run-sync`, {
      method: 'POST',
      headers: { 'X-Service-Api-Key': this.serviceApiKey },
      body: form,
    });
    if (!res.ok) {
      throw new Error(`runSync failed with status ${res.status}`);
    }
    const raw = await res.text();
    return aggregateSSE(raw);
  }
}

module.exports = { BackendClient, parseSSE, aggregateSSE };
