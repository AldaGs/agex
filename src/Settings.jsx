import { useEffect, useMemo, useState } from 'react';
import {
  ALL_PROVIDERS,
  getProviderClass,
  getLLMConfig,
  saveLLMConfig,
} from './llm';

/**
 * Settings modal. v1 scope is LLM provider config; future settings sections
 * can slot in as additional collapsible blocks below.
 */
export default function Settings({ open, onClose }) {
  const [config, setConfig] = useState(null);
  const [provider, setProvider] = useState('ollama');
  const [providerCfg, setProviderCfg] = useState({});
  const [autoName, setAutoName] = useState(true);

  const [saveMsg, setSaveMsg] = useState('');
  const [testState, setTestState] = useState({ status: 'idle', text: '' });

  useEffect(() => {
    if (!open) return;
    (async () => {
      const c = await getLLMConfig({ force: true });
      setConfig(c);
      setProvider(c.provider);
      setProviderCfg({ ...(c.providers?.[c.provider] || {}) });
      setAutoName(c.autoName !== false);
      setSaveMsg('');
      setTestState({ status: 'idle', text: '' });
    })();
  }, [open]);

  const onChangeProvider = (next) => {
    setProvider(next);
    setProviderCfg({ ...(config?.providers?.[next] || {}) });
    setTestState({ status: 'idle', text: '' });
  };

  const ProviderCls = useMemo(() => getProviderClass(provider), [provider]);
  const fields = ProviderCls.configSchema || [];

  const handleTest = async () => {
    setTestState({ status: 'busy', text: 'Testing…' });
    try {
      const instance = new ProviderCls(providerCfg);
      const res = await instance.testConnection();
      setTestState({ status: 'ok', text: `OK · sample: "${(res.sample || '').slice(0, 40)}"` });
    } catch (e) {
      setTestState({ status: 'error', text: e.message || 'Connection failed.' });
    }
  };

  const handleSave = async () => {
    setSaveMsg('');
    try {
      await saveLLMConfig({
        provider,
        autoName,
        providers: { [provider]: providerCfg },
      });
      setSaveMsg('Saved.');
      setTimeout(() => setSaveMsg(''), 1500);
    } catch (e) {
      setSaveMsg(e.message || 'Save failed.');
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Settings">
        <div className="modal-header">
          <h2 className="modal-title">Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="settings-body">
          <section className="settings-section">
            <h3 className="settings-section-title">LLM Provider</h3>

            <label className="lib-field">
              <span className="lib-field-label">Provider</span>
              <select
                value={provider}
                onChange={(e) => onChangeProvider(e.target.value)}
              >
                {ALL_PROVIDERS.map((P) => (
                  <option key={P.id} value={P.id}>{P.displayName}</option>
                ))}
              </select>
            </label>

            {fields.map((f) => (
              <label key={f.key} className="lib-field">
                <span className="lib-field-label">{f.label}</span>
                <input
                  type={f.type === 'password' ? 'password' : 'text'}
                  value={providerCfg[f.key] ?? ''}
                  onChange={(e) => setProviderCfg({ ...providerCfg, [f.key]: e.target.value })}
                  placeholder={f.placeholder || ''}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            ))}

            <div className="settings-row">
              <button className="btn-secondary" onClick={handleTest}>
                Test connection
              </button>
              {testState.status !== 'idle' && (
                <span className={`status-pill ${testState.status === 'busy' ? 'busy' : testState.status === 'ok' ? 'ok' : 'error'}`}>
                  {testState.text}
                </span>
              )}
            </div>
          </section>

          <section className="settings-section">
            <h3 className="settings-section-title">Behavior</h3>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={autoName}
                onChange={(e) => setAutoName(e.target.checked)}
              />
              <span>
                Auto-name new bindings in the background
                <small> · uses the active provider</small>
              </span>
            </label>
          </section>
        </div>

        <div className="modal-footer">
          {saveMsg && <span className="settings-save-msg">{saveMsg}</span>}
          <button className="btn-secondary" onClick={onClose}>Close</button>
          <button className="btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
