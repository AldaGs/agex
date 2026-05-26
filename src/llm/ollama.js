import {
  LLMProvider,
  SYSTEM_GENERATE,
  SYSTEM_AUTONAME,
  stripFences,
} from './provider';

export class OllamaProvider extends LLMProvider {
  static id = 'ollama';
  static displayName = 'Ollama (local)';
  static configSchema = [
    { key: 'endpoint', label: 'Endpoint', type: 'url', placeholder: 'http://localhost:11434' },
    { key: 'model', label: 'Model', type: 'text', placeholder: 'qwen2.5-coder:7b' },
  ];

  get endpoint() { return this.config.endpoint || 'http://localhost:11434'; }
  get model() { return this.config.model || 'qwen2.5-coder:7b'; }

  async _chat(system, user) {
    const res = await fetch(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        stream: false,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Ollama ${res.status}: ${body.slice(0, 200) || res.statusText}`);
    }
    const data = await res.json();
    return (data?.message?.content ?? data?.response ?? '').trim();
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
    const out = await this._chat(SYSTEM_GENERATE, this.buildExpressionUserPrompt(prompt, context));
    return stripFences(out);
  }

  async autoName(expression) {
    const out = await this._chat(SYSTEM_AUTONAME, expression);
    // Trim quotes/punctuation the model sometimes adds even when told not to.
    return stripFences(out).replace(/^['"]+|['"]+$|[.!?]+$/g, '').trim();
  }
}
