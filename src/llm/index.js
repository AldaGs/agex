// Provider registry + active-provider resolution. Concrete provider classes
// are imported here so callers don't need to know which exist.

import { getLLMConfig, saveLLMConfig, invalidateLLMConfig } from './config';
import { OllamaProvider } from './ollama';
import { ClaudeProvider } from './claude';
import { OpenAIProvider } from './openai';

export const PROVIDER_REGISTRY = {
  [OllamaProvider.id]: OllamaProvider,
  [ClaudeProvider.id]: ClaudeProvider,
  [OpenAIProvider.id]: OpenAIProvider,
};

export const ALL_PROVIDERS = Object.values(PROVIDER_REGISTRY);

export function getProviderClass(id) {
  return PROVIDER_REGISTRY[id] || OllamaProvider;
}

export async function getActiveProvider() {
  const cfg = await getLLMConfig();
  const Cls = getProviderClass(cfg.provider);
  const providerConfig = cfg.providers?.[cfg.provider] || {};
  return new Cls(providerConfig);
}

export {
  OllamaProvider,
  ClaudeProvider,
  OpenAIProvider,
  getLLMConfig,
  saveLLMConfig,
  invalidateLLMConfig,
};
