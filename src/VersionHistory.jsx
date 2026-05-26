import Editor from '@monaco-editor/react';
import { useState } from 'react';

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (sameDay) return `Today · ${time}`;
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${date} · ${time}`;
}

export default function VersionHistory({ open, binding, onClose, onRestore }) {
  const [expandedIdx, setExpandedIdx] = useState(null);
  if (!open || !binding) return null;
  const versions = binding.versions || [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal version-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Version history">
        <div className="modal-header">
          <h2 className="modal-title">Version history</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-sub">
          {binding.label || binding.displayName} · {versions.length} previous version{versions.length === 1 ? '' : 's'} (newest first)
        </div>

        {versions.length === 0 ? (
          <div className="empty-state">No previous versions yet. They're recorded each time you Update.</div>
        ) : (
          <div className="layer-list version-list">
            {versions.map((v, idx) => {
              const isOpen = expandedIdx === idx;
              return (
                <div key={idx} className={`version-row ${isOpen ? 'open' : ''}`}>
                  <div className="version-row-head">
                    <button
                      className="version-row-toggle"
                      onClick={() => setExpandedIdx(isOpen ? null : idx)}
                    >
                      <span className="chevron">▾</span>
                      <span className="version-time">{fmtTime(v.savedAt)}</span>
                      <span className="version-preview">{v.expression.split('\n')[0].slice(0, 60)}</span>
                    </button>
                    <button
                      className="btn-secondary version-restore"
                      onClick={() => {
                        onRestore(idx);
                        onClose();
                      }}
                    >
                      Restore
                    </button>
                  </div>
                  {isOpen && (
                    <div className="version-editor-wrap">
                      <Editor
                        height="160px"
                        defaultLanguage="javascript"
                        theme="vs-dark"
                        value={v.expression}
                        options={{
                          readOnly: true,
                          minimap: { enabled: false },
                          fontSize: 11,
                          scrollBeyondLastLine: false,
                          wordWrap: 'on',
                          lineNumbers: 'on',
                          folding: false,
                          renderLineHighlight: 'none',
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
