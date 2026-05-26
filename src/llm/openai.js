import {
  LLMProvider,
  SYSTEM_GENERATE,
  SYSTEM_AUTONAME,
  stripFences,
} from './provider';

export class OpenAIProvider extends LLMProvider {
  static id = 'openai';
  static displayName = 'OpenAI';
  static configSchema = [
    { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-…' },
    { key: 'model', label: 'Model', type: 'text', placeholder: 'gpt-4o-mini' },
  ];

  get apiKey() { return this.config.apiKey || ''; }
  get model() { return this.config.model || 'gpt-4o-mini'; }

  async _chat(system, user, { maxTokens = 600, temperature = 0.2 } = {}) {
    if (!this.apiKey) throw new Error('OpenAI API key not configured.');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200) || res.statusText}`);
    }
    const data = await res.json();
    return (data?.choices?.[0]?.message?.content || '').trim();
  }

  buildExpressionUserPrompt(prompt, context = {}) {
    const lines = [];
    if (context.propertyName) lines.push(`Target property: ${context.propertyName}`);
    if (context.currentExpression && context.currentExpression.trim()) {
      lines.push(`Current expression:\n${context.currentExpression}`);
    }
    lines.push(`Request: ${prompt}`);
    return lines.join('\n\n');
  }

  async generateExpression(prompt, context = {}) {
    const out = await this._chat(
      SYSTEM_GENERATE,
      this.buildExpressionUserPrompt(prompt, context),
      { maxTokens: 800 }
    );
    return stripFences(out);
  }

  async autoName(expression) {
    const out = await this._chat(SYSTEM_AUTONAME, expression, { maxTokens: 30 });
    return stripFences(out).replace(/^['"]+|['"]+$|[.!?]+$/g, '').trim();
  }
}
