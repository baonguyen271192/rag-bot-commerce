'use strict';

class LLMClient {
  constructor({ apiKey, model = 'minimax/minimax-m3:free', fetchImpl = fetch, baseUrl = 'https://openrouter.ai/api/v1' }) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetch = fetchImpl;
    this.baseUrl = baseUrl;
  }

  async complete({ systemPrompt, messages }) {
    const res = await this.fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
      }),
    });
    if (!res.ok) {
      const detail = res.text ? await res.text() : '';
      throw new Error(`OpenRouter chat completion failed with status ${res.status}: ${detail}`);
    }
    const data = await res.json();
    if (!data.choices || data.choices.length === 0) {
      throw new Error('OpenRouter response had no choices');
    }
    return data.choices[0].message.content;
  }
}

module.exports = { LLMClient };
