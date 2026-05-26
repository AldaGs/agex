// Base contract for LLM providers. Each concrete provider extends this and
// implements generateExpression + autoName. Construction takes a per-provider
// config object (endpoint/model/apiKey/…) — the provider itself doesn't know
// about persistence or selection, that's the index module's job.

export class LLMProvider {
  static id = '';
  static displayName = '';
  static configSchema = []; // [{ key, label, type: 'text'|'password'|'url', placeholder }]

  constructor(config = {}) {
    this.config = config;
  }

  async generateExpression(_prompt, _context = {}) {
    throw new Error(`${this.constructor.name}.generateExpression not implemented`);
  }

  async autoName(_expression) {
    throw new Error(`${this.constructor.name}.autoName not implemented`);
  }

  // Optional. Default implementation: try a tiny autoName.
  async testConnection() {
    const out = await this.autoName('value');
    return { ok: true, sample: out };
  }
}

// Shared system prompts — providers concatenate context onto the user turn.
export const SYSTEM_GENERATE =
  'You are an After Effects expression generator. Output ONLY the expression body — ' +
  'no markdown fences, no commentary, no explanation. Use After Effects expression ' +
  'syntax (JavaScript-like with AE globals such as time, value, thisComp, thisLayer, ' +
  'wiggle, valueAtTime, linear, ease, loopOut, etc.). Declare any parameters at the ' +
  'top using `let X = Y;` statements so users can tweak them in the editor.';

export const SYSTEM_AUTONAME =
  'You name After Effects expressions for a library UI. Given an expression, output ' +
  'a short label (2 to 5 words) describing what it does. Output ONLY the label — no ' +
  'quotes, no trailing punctuation, no commentary.';

// Strip a leading/trailing markdown code fence if the model ignored instructions.
export function stripFences(text) {
  return String(text || '')
    .replace(/^\s*```[a-zA-Z]*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim();
}
