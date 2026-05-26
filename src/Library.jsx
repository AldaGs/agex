import { useEffect, useMemo, useState } from 'react';
import { loadAllSnippets } from './vault';

/**
 * Library browser. Modeless from the parent's perspective — parent controls
 * `open` and `onClose`. On insert, parent receives the snippet body and is
 * responsible for pushing it into the Monaco editor.
 *
 * v1 scope: browse + search + filter + insert.
 * CRUD (new/edit/fork/delete) + Factory Reset land in later phases (B5/B6).
 */
export default function Library({ open, onClose, onInsert }) {
  const [snippets, setSnippets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await loadAllSnippets();
        if (!cancelled) setSnippets(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
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
      const hay = [
        s.name,
        s.description,
        s.body,
        (s.tags || []).join(' '),
        s.category,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [snippets, query, category]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal library-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Library</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <input
          className="lib-search"
          type="text"
          placeholder="Search name, tag, body…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

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
                    <span className={`badge ${s.source === 'builtin' ? 'badge-builtin' : 'badge-user'}`}>
                      {s.source === 'builtin' ? 'BI' : 'USR'}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="lib-row-body">
                      {s.description && (
                        <div className="lib-desc">{s.description}</div>
                      )}
                      <pre className="lib-code">{s.body}</pre>
                      <div className="lib-actions">
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
      </div>
    </div>
  );
}
