// Library (the Vault) — merges bundled built-ins with user snippets stored
// in %AppData%/Roaming/AG-Extensions/agex/lib/<slug>.json.
//
// Built-ins are immutable. "Editing" a built-in clones it to a fresh id
// (source: "user"); the original stays in the list. Factory Reset wipes
// user space; built-ins re-emerge in their pristine state.

import { evalScript } from './cep-bridge';
import builtinSnippets from './builtins/snippets.json';

const BUILTIN_BY_ID = new Map(
  builtinSnippets.map((s) => [s.id, { ...s, source: 'builtin' }])
);

export async function loadAllSnippets() {
  let user = [];
  try {
    const res = await evalScript('listSnippets');
    if (res.success && Array.isArray(res.snippets)) {
      user = res.snippets.filter((s) => s && s.id);
    }
  } catch (_) {
    // No user lib yet — fall through to built-ins only.
  }
  // User snippets with the same id as a built-in (legacy from earlier dev
  // builds, or manual edit) take precedence in display.
  const out = new Map();
  for (const b of BUILTIN_BY_ID.values()) out.set(b.id, b);
  for (const u of user) out.set(u.id, { ...u, source: u.source || 'user' });
  return Array.from(out.values()).sort((a, b) => {
    // Built-ins first, then alphabetical
    if (a.source !== b.source) return a.source === 'builtin' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function saveUserSnippet(snippet) {
  const now = new Date().toISOString();
  const finalSnippet = {
    ...snippet,
    source: 'user',
    createdAt: snippet.createdAt || now,
    updatedAt: now,
  };
  const raw = JSON.stringify(finalSnippet, null, 2);
  const res = await evalScript('writeSnippet', { id: finalSnippet.id, raw });
  if (!res.success) throw new Error(res.message || 'Failed to write snippet.');
  return finalSnippet;
}

export async function deleteUserSnippet(id) {
  const res = await evalScript('deleteSnippet', { id });
  if (!res.success) throw new Error(res.message || 'Failed to delete snippet.');
  return res.existed;
}

export async function factoryResetAll() {
  const res = await evalScript('factoryReset');
  if (!res.success) throw new Error(res.message || 'Factory reset failed.');
  return res;
}

// Fork a built-in into user space. The new snippet gets a fresh id derived
// from the original + a timestamp, and source: "user". The built-in stays.
export async function forkBuiltin(builtin, overrides = {}) {
  const stamp = Date.now().toString(36);
  const fork = {
    ...builtin,
    ...overrides,
    id: overrides.id || `${builtin.id}-fork-${stamp}`,
    source: 'user',
    name: overrides.name || `${builtin.name} (copy)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return saveUserSnippet(fork);
}

// Slugify a user-provided name into a filesystem-safe id.
export function slugify(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || `snippet-${Date.now().toString(36)}`;
}
