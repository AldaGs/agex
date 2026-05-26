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

// Export every user snippet to a JSON bundle file chosen by the OS dialog.
// Returns { cancelled, path, count } so the UI can show meaningful feedback.
export async function exportLibraryBundle() {
  const all = await loadAllSnippets();
  const userSnippets = all.filter((s) => s.source !== 'builtin');
  const bundle = {
    kind: 'agex-library-bundle',
    version: 1,
    exportedAt: new Date().toISOString(),
    snippets: userSnippets,
  };
  const raw = JSON.stringify(bundle, null, 2);
  const res = await evalScript('exportBundle', { raw });
  if (!res.success) throw new Error(res.message || 'Export failed.');
  return { cancelled: !!res.cancelled, path: res.path, count: userSnippets.length };
}

// Import snippets from a chosen bundle file. Collision rule: incoming
// snippets whose id already exists get suffixed with -imported (and a
// numeric counter on further collisions). Returns { cancelled, imported, skipped }.
export async function importLibraryBundle() {
  const res = await evalScript('importBundle');
  if (!res.success) throw new Error(res.message || 'Import failed.');
  if (res.cancelled) return { cancelled: true, imported: 0, skipped: 0 };

  let bundle;
  try { bundle = JSON.parse(res.raw); }
  catch (_) { throw new Error('Selected file is not valid JSON.'); }

  const incoming = Array.isArray(bundle?.snippets)
    ? bundle.snippets
    : (Array.isArray(bundle) ? bundle : null);
  if (!incoming) throw new Error('No "snippets" array found in the bundle.');

  const existing = await loadAllSnippets();
  const existingIds = new Set(existing.map((s) => s.id));
  let imported = 0;
  let skipped = 0;

  for (const s of incoming) {
    if (!s?.id || !s?.name || typeof s.body !== 'string') { skipped++; continue; }
    let id = s.id;
    if (existingIds.has(id)) {
      let candidate = `${s.id}-imported`;
      let n = 2;
      while (existingIds.has(candidate)) candidate = `${s.id}-imported-${n++}`;
      id = candidate;
    }
    existingIds.add(id);
    await saveUserSnippet({ ...s, id });
    imported++;
  }

  return { cancelled: false, imported, skipped };
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
