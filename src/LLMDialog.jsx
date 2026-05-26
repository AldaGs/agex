import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Bot } from 'lucide-react';
import { getActiveProvider, getLLMConfig } from './llm';

/**
 * Ask-Agent dialog. State is intentionally preserved across open/close so a
 * user closing the dialog and re-opening it later still sees their last
 * prompt + result.
 */
export default function LLMDialog({
  open,
  onClose,
  context,
  onInsert,
  onReplace,
}) {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [providerLabel, setProviderLabel] = useState('');
  const textareaRef = useRef(null);

  // Refresh provider label whenever the dialog re-opens, but DO NOT touch
  // prompt/result so the user's last work is preserved.
  useEffect(() => {
    if (!open) return;
    (async () => {
      const cfg = await getLLMConfig();
      setProviderLabel(cfg.provider);
    })();
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [open]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setStatus('busy');
    setError('');
    try {
      const provider = await getActiveProvider();
      const out = await provider.generateExpression(prompt.trim(), context || {});
      setResult(out);
      setStatus('ok');
    } catch (e) {
      setError(e?.message || 'Generation failed.');
      setStatus('error');
    }
  };

  const handleKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleGenerate();
    }
  };

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(result); } catch (_) {}
  };

  const handleClear = () => {
    setPrompt('');
    setResult('');
    setError('');
    setStatus('idle');
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal llm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            <Bot size={16} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
            Ask Agent
            <span className="llm-provider-tag">{providerLabel}</span>
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        {context?.propertyName && (
          <div className="modal-sub">
            Target: <strong>{context.propertyName}</strong>
            {context.currentExpression?.trim() && (
              <span> · current expression will be sent as context</span>
            )}
          </div>
        )}

        <label className="lib-field">
          <span className="lib-field-label">Prompt</span>
          <textarea
            ref={textareaRef}
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKey}
            placeholder={'e.g. "wiggle position on Y only, gently"\n\nCtrl+Enter to generate'}
            spellCheck={false}
          />
        </label>

        <div className="settings-row">
          <button
            className="btn-primary"
            onClick={handleGenerate}
            disabled={status === 'busy' || !prompt.trim()}
          >
            {status === 'busy' ? 'Generating…' : 'Generate'}
          </button>
          {(prompt || result) && (
            <button className="btn-secondary" onClick={handleClear}>
              Clear
            </button>
          )}
          {status === 'busy' && (
            <span className="status-pill busy">Talking to {providerLabel}…</span>
          )}
        </div>

        {error && <div className="lib-form-error">{error}</div>}

        {result && (
          <>
            <div className="lib-field-label" style={{ marginTop: 10 }}>Result</div>
            <div className="llm-result-editor">
              <Editor
                height="220px"
                defaultLanguage="javascript"
                theme="vs-dark"
                value={result}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 12,
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  lineNumbers: 'on',
                  folding: false,
                  padding: { top: 6, bottom: 6 },
                  renderLineHighlight: 'none',
                  scrollbar: { vertical: 'auto', alwaysConsumeMouseWheel: false },
                }}
              />
            </div>
            <div className="lib-actions">
              <button className="btn-secondary" onClick={handleCopy} title="Copy to clipboard">
                Copy
              </button>
              <button className="btn-secondary" onClick={handleGenerate} title="Regenerate">
                Regenerate
              </button>
              <button className="btn-secondary" onClick={() => { onReplace(result); onClose(); }}>
                Replace
              </button>
              <button className="btn-primary lib-insert-btn" onClick={() => { onInsert(result); onClose(); }}>
                Insert
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
