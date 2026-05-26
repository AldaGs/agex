import { useEffect, useRef, useState } from 'react';
import { getActiveProvider, getLLMConfig } from './llm';

/**
 * Ask-AI dialog. Sends the user's prompt + a small context block (target
 * property name + current expression buffer) to the active provider and
 * shows the result with Insert / Replace / Copy actions.
 */
export default function LLMDialog({
  open,
  onClose,
  context,           // { propertyName, currentExpression }
  onInsert,          // (text) => void  — inserts at cursor in Monaco
  onReplace,         // (text) => void  — replaces the whole expression buffer
}) {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle' | 'busy' | 'error' | 'ok'
  const [error, setError] = useState('');
  const [providerLabel, setProviderLabel] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setResult('');
    setError('');
    setStatus('idle');
    (async () => {
      const cfg = await getLLMConfig();
      setProviderLabel(cfg.provider);
    })();
    // Focus the prompt textarea
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
    // Ctrl/Cmd+Enter triggers generate from inside the textarea
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleGenerate();
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result);
    } catch (_) { /* clipboard may be restricted */ }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal llm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            Ask AI <span className="llm-provider-tag">{providerLabel}</span>
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
            placeholder={'e.g. "wiggle the position only on Y, gently"\n\nCtrl+Enter to generate'}
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
          {status === 'busy' && <span className="status-pill busy">Talking to {providerLabel}…</span>}
        </div>

        {error && <div className="lib-form-error">{error}</div>}

        {result && (
          <>
            <div className="lib-field-label" style={{ marginTop: 10 }}>Result</div>
            <pre className="lib-code">{result}</pre>
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
