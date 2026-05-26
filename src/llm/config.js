import { evalScript } from '../cep-bridge';

export const DEFAULT_LLM_CONFIG = {
  provider: 'ollama',
  autoName: true,            // background auto-naming on new bindings
  providers: {
    ollama: {
      endpoint: 'http://localhost:11434',
      model: 'qwen2.5-coder:7b',
    },
    claude: {
      apiKey: '',
      model: 'claude-3-5-sonnet-20241022',
    },
    openai: {
      apiKey: '',
      model: 'gpt-4o-mini',
    },
  },
};

let cached = null;

function mergeDeep(base, overrides) {
  const out = { ...base };
  for (const k of Object.keys(overrides || {})) {
    if (overrides[k] && typeof overrides[k] === 'object' && !Array.isArray(overrides[k])) {
      out[k] = mergeDeep(base[k] || {}, overrides[k]);
    } else {
      out[k] = overrides[k];
    }
  }
  return out;
}

export async function getLLMConfig({ force = false } = {}) {
  if (cached && !force) return cached;
  try {
    const res = await evalScript('readConfig', { name: 'llm' });
    if (res?.success && res.found && typeof res.raw === 'string' && res.raw) {
      try {
        const parsed = JSON.parse(res.raw);
        cached = mergeDeep(DEFAULT_LLM_CONFIG, parsed);
        return cached;
      } catch (_) {
        // Malformed file — fall through to defaults
      }
    }
  } catch (_) {
    // No config yet — use defaults
  }
  cached = { ...DEFAULT_LLM_CONFIG };
  return cached;
}

export async function saveLLMConfig(partial) {
  const current = cached || (await getLLMConfig());
  const next = mergeDeep(current, partial);
  cached = next;
  const raw = JSON.stringify(next, null, 2);
  const res = await evalScript('writeConfig', { name: 'llm', raw });
  if (!res?.success) throw new Error(res?.message || 'Failed to save LLM config.');
  return next;
}

export function invalidateLLMConfig() {
  cached = null;
}
