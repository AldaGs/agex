import {
  LLMProvider,
  SYSTEM_GENERATE,
  SYSTEM_AUTONAME,
  stripFences,
} from './provider';

export class ClaudeProvider extends LLMProvider {
  static id = 'claude';
  static displayName = 'Claude (Anthropic)';
  static configSchema = [
    { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-ant-…' },
    { key: 'model', label: 'Model', type: 'text', placeholder: 'claude-3-5-sonnet-20241022' },
  ];

  get apiKey() { return this.config.apiKey || ''; }
  get model() { return this.config.model || 'claude-3-5-sonnet-20241022'; }

  async _messages(system, user, { maxTokens = 600 } = {}) {
    if (!this.apiKey) throw new Error('Claude API key not configured.');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        // CEP runs in Chromium — Anthropic gates direct browser-origin calls
        // behind this opt-in header. We're not in a real public browser so
        // there's no end-user-key-leak surface.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Claude ${res.status}: ${body.slice(0, 200) || res.statusText}`);
    }
    const data = await res.json();
    const block = (data?.content || []).find((c) => c.type === 'text');
    return (block?.text || '').trim();
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
    const out = await this._messages(
      SYSTEM_GENERATE,
      this.buildExpressionUserPrompt(prompt, context),
      { maxTokens: 800 }
    );
    return stripFences(out);
  }

  async autoName(expression) {
    const out = await this._messages(SYSTEM_AUTONAME, expression, { maxTokens: 30 });
    return stripFences(out).replace(/^['"]+|['"]+$|[.!?]+$/g, '').trim();
  }
}
