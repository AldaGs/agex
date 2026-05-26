import { useEffect, useMemo, useState } from 'react';
import {
  loadAllSnippets,
  saveUserSnippet,
  deleteUserSnippet,
  factoryResetAll,
  exportLibraryBundle,
  importLibraryBundle,
  slugify,
} from './vault';

const EMPTY_DRAFT = {
  id: null,        // null = new; string = updating existing
  name: '',
  category: '',
  tags: '',        // UI state is comma-separated string; we split on save
  description: '',
  body: '',
};

export default function Library({ open, onClose, onInsert }) {
  const [snippets, setSnippets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [expandedId, setExpandedId] = useState(null);

  // 'browse' | 'edit'
  const [mode, setMode] = useState('browse');
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saveError, setSaveError] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await loadAllSnippets();
      setSnippets(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    refresh();
    setMode('browse');
  }, [open]);

  const categories = useMemo(() => {
    const set = new Set(snippets.map((s) => s.category || 'Uncategorized'));
    return ['All', ...Array.from(set).sort()];
  }, [snippets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return snippets.filter((s) => {
      if (category !== 'All' && (s.category || 'Uncategorized') !== category) return false;
      if (!q) return true;
      const hay = [s.name, s.description, s.body, (s.tags || []).join(' '), s.category]
        .join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [snippets, query, category]);

  const beginNew = () => {
    setDraft({ ...EMPTY_DRAFT });
    setSaveError('');
    setMode('edit');
  };

  const beginEdit = (snippet) => {
    setDraft({
      id: snippet.id,
      name: snippet.name || '',
      category: snippet.category || '',
      tags: (snippet.tags || []).join(', '),
      description: snippet.description || '',
      body: snippet.body || '',
    });
    setSaveError('');
    setMode('edit');
  };

  // Fork a built-in: open the edit form pre-filled with a fresh id + "(copy)"
  // suffix. The fork is materialized only when the user hits Save.
  const beginFork = (snippet) => {
    const baseName = `${snippet.name} (copy)`;
    setDraft({
      id: null,
      name: baseName,
      category: snippet.category || '',
      tags: (snippet.tags || []).join(', '),
      description: snippet.description || '',
      body: snippet.body || '',
    });
    setSaveError('');
    setMode('edit');
  };

  const handleSave = async () => {
    setSaveError('');
    const name = draft.name.trim();
    if (!name) { setSaveError('Name is required.'); return; }
    if (!draft.body.trim()) { setSaveError('Body cannot be empty.'); return; }

    // Resolve id. If editing an existing user snippet, keep the id.
    // Otherwise derive from name and disambiguate against existing ids.
    let id = draft.id;
    if (!id) {
      const base = slugify(name);
      let candidate = base;
      let n = 2;
      const existing = new Set(snippets.map((s) => s.id));
      while (existing.has(candidate)) {
        candidate = `${base}-${n++}`;
      }
      id = candidate;
    }

    const tags = draft.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const snippet = {
      id,
      name,
      description: draft.description.trim(),
      category: draft.category.trim() || 'Uncategorized',
      tags,
      body: draft.body,
    };

    try {
      await saveUserSnippet(snippet);
      await refresh();
      setMode('browse');
      setExpandedId(id);
    } catch (e) {
      setSaveError(e.message || 'Save failed.');
    }
  };

  const handleExport = async () => {
    try {
      const res = await exportLibraryBundle();
      if (res.cancelled) return;
      window.alert(`Exported ${res.count} user snippet(s) to:\n${res.path}`);
    } catch (e) {
      setSaveError(e.message || 'Export failed.');
    }
  };

  const handleImport = async () => {
    try {
      const res = await importLibraryBundle();
      if (res.cancelled) return;
      await refresh();
      const skippedMsg = res.skipped ? ` (skipped ${res.skipped} malformed)` : '';
      window.alert(`Imported ${res.imported} snippet(s)${skippedMsg}.`);
    } catch (e) {
      setSaveError(e.message || 'Import failed.');
    }
  };

  const handleFactoryReset = async () => {
    const ok = window.confirm(
      'Factory Reset will permanently delete every user snippet and config file under AG-Extensions/agex/. Built-in snippets will be restored to defaults.\n\nProceed?'
    );
    if (!ok) return;
    try {
      const res = await factoryResetAll();
      await refresh();
      window.alert(
        `Factory reset complete. Removed ${res.libRemoved} snippet file(s) and ${res.configRemoved} config file(s).`
      );
    } catch (e) {
      setSaveError(e.message || 'Factory reset failed.');
    }
  };

  const handleDelete = async (snippet) => {
    if (snippet.source === 'builtin') return; // shouldn't be reachable
    const ok = window.confirm(`Delete "${snippet.name}"? This cannot be undone.`);
    if (!ok) return;
    try {
      await deleteUserSnippet(snippet.id);
      await refresh();
    } catch (e) {
      setSaveError(e.message || 'Delete failed.');
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal library-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Library">
        <div className="modal-header">
          <h2 className="modal-title">
            {mode === 'edit' ? (draft.id ? 'Edit snippet' : 'New snippet') : 'Library'}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        {mode === 'browse' ? (
          <>
            <div className="lib-toolbar">
              <input
                className="lib-search"
                type="text"
                placeholder="Search name, tag, body…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              <button className="btn-primary lib-new-btn" onClick={beginNew}>+ New</button>
            </div>

            <div className="lib-chips">
              {categories.map((c) => (
                <button
                  key={c}
                  className={`lib-chip ${category === c ? 'active' : ''}`}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="lib-list">
              {loading ? (
                <div className="empty-state">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="empty-state">No snippets match.</div>
              ) : (
                filtered.map((s) => {
                  const isOpen = expandedId === s.id;
                  const isBuiltin = s.source === 'builtin';
                  return (
                    <div key={s.id} className={`lib-row ${isOpen ? 'open' : ''}`}>
                      <button
                        className="lib-row-head"
                        onClick={() => setExpandedId(isOpen ? null : s.id)}
                      >
                        <span className="chevron">▾</span>
                        <div className="lib-row-text">
                          <div className="lib-row-title">{s.name}</div>
                          <div className="lib-row-meta">
                            <span className="lib-cat">{s.category || 'Uncategorized'}</span>
                            {(s.tags || []).slice(0, 3).map((t) => (
                              <span key={t} className="lib-tag">{t}</span>
                            ))}
                          </div>
                        </div>
                        <span className={`badge ${isBuiltin ? 'badge-builtin' : 'badge-user'}`}>
                          {isBuiltin ? 'BI' : 'USR'}
                        </span>
                      </button>

                      {isOpen && (
                        <div className="lib-row-body">
                          {s.description && <div className="lib-desc">{s.description}</div>}
                          <pre className="lib-code">{s.body}</pre>
                          <div className="lib-actions">
                            {isBuiltin ? (
                              <button className="btn-secondary" onClick={() => beginFork(s)}>
                                Fork & Edit
                              </button>
                            ) : (
                              <>
                                <button className="btn-secondary" onClick={() => beginEdit(s)}>
                                  Edit
                                </button>
                                <button
                                  className="btn-secondary danger"
                                  onClick={() => handleDelete(s)}
                                >
                                  Delete
                                </button>
                              </>
                            )}
                            <button
                              className="btn-primary lib-insert-btn"
                              onClick={() => { onInsert(s.body); onClose(); }}
                            >
                              Insert
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="lib-footer">
              <span className="lib-footer-count">{snippets.length} snippet{snippets.length === 1 ? '' : 's'}</span>
              <div className="lib-footer-actions">
                <button className="link-action" onClick={handleImport}>Import…</button>
                <button className="link-action" onClick={handleExport}>Export…</button>
                <button className="link-action danger-link" onClick={handleFactoryReset}>
                  Factory Reset
                </button>
              </div>
            </div>
          </>
        ) : (
          // ----- Edit / New form -----
          <div className="lib-form">
            <label className="lib-field">
              <span className="lib-field-label">Name</span>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Wiggle (custom)"
                autoFocus
              />
            </label>
            <div className="lib-field-row">
              <label className="lib-field">
                <span className="lib-field-label">Category</span>
                <input
                  type="text"
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  placeholder="Randomness"
                  list="lib-category-list"
                />
                <datalist id="lib-category-list">
                  {[...new Set(snippets.map((s) => s.category).filter(Boolean))].map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
              <label className="lib-field">
                <span className="lib-field-label">Tags <small>(comma-separated)</small></span>
                <input
                  type="text"
                  value={draft.tags}
                  onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                  placeholder="wiggle, noise"
                />
              </label>
            </div>
            <label className="lib-field">
              <span className="lib-field-label">Description</span>
              <textarea
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="What this snippet does…"
              />
            </label>
            <label className="lib-field">
              <span className="lib-field-label">
                Body
                <small> · put parameters at top as <code>let X = Y;</code></small>
              </span>
              <textarea
                className="lib-body-input"
                rows={10}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                placeholder={'let frq = 10;\nlet amp = 10;\nwiggle(frq, amp);'}
                spellCheck={false}
              />
            </label>

            {saveError && <div className="lib-form-error">{saveError}</div>}

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setMode('browse')}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSave}>
                {draft.id ? 'Save changes' : 'Create snippet'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
