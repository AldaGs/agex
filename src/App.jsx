import { useState, useEffect, useMemo, useRef } from 'react';
import { evalScript } from './cep-bridge';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { registerAECompletions } from './ae-dictionary';
import './App.css';

loader.config({ monaco });

function deriveStatusLevel(status) {
  if (!status) return 'idle';
  const s = status.toLowerCase();
  if (s.startsWith('error') || s.startsWith('conflict')) return 'error';
  if (s.startsWith('injecting') || s.startsWith('updating') || s.startsWith('checking')) return 'busy';
  if (s === 'ready') return 'idle';
  return 'ok';
}

function fmtSavedAt(epochMs) {
  if (!epochMs) return 'Unsaved project';
  const d = new Date(epochMs);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `Saved ${h}:${m}`;
}

function App() {
  const [activeComp, setActiveComp] = useState({ id: null, name: "No Comp Selected" });
  const [workbench, setWorkbench] = useState({});

  const [expression, setExpression] = useState("");
  const [status, setStatus] = useState("Ready");

  const [selectedBindingId, setSelectedBindingId] = useState(null);
  const [isLayersModalOpen, setIsLayersModalOpen] = useState(false);
  const [workbenchOpen, setWorkbenchOpen] = useState(true);

  // Persistence state
  const [projectFsName, setProjectFsName] = useState(null);
  const [lastSavedTime, setLastSavedTime] = useState(0); // epoch ms, on-disk mtime
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState('{}');
  const bootedRef = useRef(false); // guards autosave until first rehydrate completes

  const activeBindings = workbench[activeComp.id] || [];
  const activeBindingData = activeBindings.find(b => b.id === selectedBindingId);
  const statusLevel = useMemo(() => deriveStatusLevel(status), [status]);
  const workbenchSnapshot = useMemo(() => JSON.stringify(workbench), [workbench]);
  const isDirty = bootedRef.current && workbenchSnapshot !== lastSavedSnapshot;

  const fetchActiveComp = async (silent = false) => {
    try {
      const response = await evalScript('getActiveCompContext');
      if (response.success) {
        setActiveComp((prevComp) => {
          if (prevComp.id !== response.compId) {
            setSelectedBindingId(null);
            setExpression("");
            return { id: response.compId, name: response.compName };
          }
          return prevComp;
        });
        if (!silent) setStatus(`Context synced: ${response.compName}`);
      } else {
        setActiveComp((prev) => prev.id !== null ? { id: null, name: "No Comp Selected" } : prev);
        if (!silent) setStatus(response.message);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const fetchProjectFingerprint = async () => {
    try {
      const fp = await evalScript('getProjectFingerprint');
      if (!fp.success || !fp.open) {
        if (projectFsName !== null) {
          setProjectFsName(null);
          setLastSavedTime(0);
          setLastSavedSnapshot('{}');
          setWorkbench({});
          bootedRef.current = false;
        }
        return;
      }
      if (fp.fsName !== projectFsName) {
        setProjectFsName(fp.fsName);
        bootedRef.current = false;
        try { await evalScript('clearStateLog'); } catch (_) {}
        try {
          const res = await evalScript('loadWorkbenchState');
          if (res.success && res.found && res.data) {
            try {
              const parsed = JSON.parse(res.data);
              setWorkbench(parsed);
              setLastSavedSnapshot(JSON.stringify(parsed));
            } catch (_) {
              setWorkbench({});
              setLastSavedSnapshot('{}');
            }
          } else {
            setWorkbench({});
            setLastSavedSnapshot('{}');
          }
        } finally {
          bootedRef.current = true;
        }
      }
      setLastSavedTime(fp.modifiedTime || 0);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchProjectFingerprint();
    fetchActiveComp(false);
    const intervalId = setInterval(() => {
      fetchProjectFingerprint();
      fetchActiveComp(true);
    }, 1000);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectFsName]);

  // Debounced autosave: any workbench mutation triggers a 500ms-debounced
  // saveWorkbenchState. Skipped until first rehydrate completes so we don't
  // blow away XMP data with an empty {} on boot.
  useEffect(() => {
    if (!bootedRef.current) return;
    if (workbenchSnapshot === lastSavedSnapshot) return;
    const id = setTimeout(async () => {
      try {
        const res = await evalScript('saveWorkbenchState', { json: workbenchSnapshot });
        if (res.success) {
          setLastSavedSnapshot(workbenchSnapshot);
        } else {
          setStatus(`Error saving: ${res.message}`);
        }
      } catch (e) {
        console.error(e);
      }
    }, 500);
    return () => clearTimeout(id);
  }, [workbenchSnapshot, lastSavedSnapshot]);

  const handleAddToWorkbench = async () => {
    setStatus("Checking selection...");
    try {
      const peekResponse = await evalScript('peekSelection');

      if (!peekResponse.success) {
        setStatus(`Error: ${peekResponse.message}`);
        return;
      }

      const existingLayerIds = new Set();
      activeBindings.forEach(binding => {
        binding.layers.forEach(layer => existingLayerIds.add(layer.id));
      });

      const conflictingLayers = peekResponse.layers.filter(layer => existingLayerIds.has(layer.id));

      if (conflictingLayers.length > 0) {
        const conflictNames = conflictingLayers.map(l => l.name).join(', ');
        setStatus(`Conflict: Layer(s) already in Workbench: ${conflictNames}`);
        return;
      }

      setStatus("Injecting...");
      const payload = { expression: expression, targetProperty: "", layerIds: [] };
      const injectResponse = await evalScript('smartInject', payload);

      if (injectResponse.success) {
        let finalPropName = "Custom Property";
        let finalPropDisplay = "Custom Property";

        if (injectResponse.properties && injectResponse.properties.length > 0) {
          finalPropName = injectResponse.properties[0].matchName;
          finalPropDisplay = injectResponse.properties[0].displayName;
        }

        setStatus(`${injectResponse.message} Target: ${finalPropDisplay}`);

        if (activeComp.id) {
          setWorkbench(prev => {
            const currentCompList = prev[activeComp.id] || [];
            const newBinding = {
              id: Date.now().toString(),
              expression: expression,
              matchName: finalPropName,
              displayName: finalPropDisplay,
              layers: injectResponse.layers
            };
            return { ...prev, [activeComp.id]: [...currentCompList, newBinding] };
          });
        }
      } else {
        setStatus(`Error: ${injectResponse.message}`);
      }
    } catch (error) {
      console.error(error);
      setStatus("Error connecting to host.");
    }
  };

  const handleUpdateBinding = async () => {
    if (!selectedBindingId) return;
    setStatus("Updating...");

    const payload = {
      expression: expression,
      targetProperty: activeBindingData.matchName,
      layerIds: activeBindingData.layers.map(l => l.id)
    };

    try {
      const response = await evalScript('smartInject', payload);

      if (response.success) {
        setStatus(`Updated ${response.layers.length} properties.`);
        setWorkbench(prev => {
          const currentCompList = prev[activeComp.id] || [];
          return {
            ...prev,
            [activeComp.id]: currentCompList.map(b =>
              b.id === selectedBindingId
                ? { ...b, expression, layers: response.layers }
                : b
            )
          };
        });
      } else {
        setStatus(`Error: ${response.message}`);
      }
    } catch (error) {
      console.error(error);
      setStatus("Error connecting to host.");
    }
  };

  const handleSelectBinding = (binding) => {
    if (selectedBindingId === binding.id) {
      setSelectedBindingId(null);
      setExpression("");
      setStatus("Switched to New Injection mode.");
    } else {
      setSelectedBindingId(binding.id);
      setExpression(binding.expression);
      setStatus(`Loaded binding: ${binding.displayName}`);
    }
  };

  const handleCancelEdit = () => {
    setSelectedBindingId(null);
    setExpression("");
    setStatus("Switched to New Injection mode.");
  };

  return (
    <div className="app">

      <header className="topbar">
        <div className="comp-info">
          <span className="comp-label">
            Active Comp
            <span className="save-info" title={projectFsName || ''}>
              · {fmtSavedAt(lastSavedTime)}
              {isDirty && <span className="dirty-dot" title="Modified — autosaving to XMP" />}
            </span>
          </span>
          <span className={`comp-name ${activeComp.id ? '' : 'empty'}`}>{activeComp.name}</span>
        </div>
        <div className={`status-pill ${statusLevel}`} title={status}>{status}</div>
      </header>

      <section className="editor-section">
        <div className="editor-header">
          <h2 className="editor-title">
            {selectedBindingId ? (
              <>
                <span className="badge badge-edit">Edit</span>
                <span className="name">{activeBindingData?.displayName}</span>
              </>
            ) : (
              <>
                <span className="badge badge-new">New</span>
                <span className="name">Injection</span>
              </>
            )}
          </h2>

          {selectedBindingId && activeBindingData && (
            <button className="pill-btn" onClick={() => setIsLayersModalOpen(true)}>
              {activeBindingData.layers.length} layer{activeBindingData.layers.length === 1 ? '' : 's'}
            </button>
          )}
        </div>

        <div className="editor-wrap">
          <Editor
            height="100%"
            defaultLanguage="javascript"
            theme="vs-dark"
            value={expression}
            beforeMount={registerAECompletions}
            onChange={(val) => setExpression(val || "")}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              wordWrap: 'on',
              folding: true,
              lineNumbersMinChars: 3,
              scrollBeyondLastLine: false,
              padding: { top: 6, bottom: 6 }
            }}
          />
        </div>
      </section>

      <div className="action-bar">
        {selectedBindingId ? (
          <>
            <button className="btn-primary update" onClick={handleUpdateBinding}>
              Update Expression
            </button>
            <button className="btn-secondary" onClick={handleCancelEdit} title="Switch back to new injection">
              Cancel
            </button>
          </>
        ) : (
          <button className="btn-primary" onClick={handleAddToWorkbench} disabled={!activeComp.id}>
            Add to Workbench
          </button>
        )}
      </div>

      <section className={`workbench ${workbenchOpen ? 'open' : 'collapsed'}`}>
        <button
          className="workbench-header"
          onClick={() => setWorkbenchOpen(o => !o)}
          aria-expanded={workbenchOpen}
        >
          <span className="chevron">▾</span>
          <span>Workbench</span>
          <span className="count-badge">{activeBindings.length}</span>
        </button>

        {workbenchOpen && (
          <div className="binding-list">
            {activeBindings.length === 0 ? (
              <div className="empty-state">No bindings in this composition.</div>
            ) : (
              activeBindings.map(binding => (
                <div
                  key={binding.id}
                  className={`binding-card ${selectedBindingId === binding.id ? 'selected' : ''}`}
                  onClick={() => handleSelectBinding(binding)}
                >
                  <div className="row">
                    <span className="prop-name">{binding.displayName}</span>
                    <span className="layer-count">{binding.layers.length}L</span>
                  </div>
                  <div className="expr-preview">{binding.expression || <em>(empty)</em>}</div>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {isLayersModalOpen && activeBindingData && (
        <div className="modal-backdrop" onClick={() => setIsLayersModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Injected Layers</h2>
              <button className="icon-btn" onClick={() => setIsLayersModalOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-sub">
              Property: <strong>{activeBindingData.displayName}</strong>
            </div>
            <div className="layer-list">
              {activeBindingData.layers.map((layer, idx) => (
                <div key={idx} className="layer-item">
                  <span className="layer-id">#{layer.id}</span>
                  <span>{layer.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
