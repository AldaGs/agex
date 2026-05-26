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

  // Scan modal state
  const [scanGroups, setScanGroups] = useState(null); // null = closed; array = open
  const [scanSelected, setScanSelected] = useState({}); // groupKey -> bool

  // Multi-select merge state
  const [multiSelect, setMultiSelect] = useState(() => new Set()); // binding IDs
  const [mergeOpen, setMergeOpen] = useState(false);

  // Expression-error map: `${layerId}:${matchName}` -> error string
  const [errorMap, setErrorMap] = useState({});

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

  const handleSelectBinding = (binding, e) => {
    // Ctrl/Cmd+click → toggle multi-select for merging
    if (e && (e.ctrlKey || e.metaKey)) {
      setMultiSelect(prev => {
        const next = new Set(prev);
        if (next.has(binding.id)) next.delete(binding.id);
        else next.add(binding.id);
        return next;
      });
      return;
    }
    // Plain click — clear any multi-select, then toggle edit mode
    if (multiSelect.size > 0) setMultiSelect(new Set());
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

  // --- Merge selected bindings (A4) ---
  const selectedForMerge = useMemo(
    () => activeBindings.filter(b => multiSelect.has(b.id)),
    [activeBindings, multiSelect]
  );

  const mergeMatchNameConflict = useMemo(() => {
    const set = new Set(selectedForMerge.map(b => b.matchName));
    return set.size > 1;
  }, [selectedForMerge]);

  const handleMerge = async (mode) => {
    if (selectedForMerge.length < 2) return;
    if (mergeMatchNameConflict) {
      setStatus("Error: cannot merge bindings with different target properties.");
      return;
    }
    const matchName = selectedForMerge[0].matchName;
    const displayName = selectedForMerge[0].displayName;

    // mode: 'fuzzy' = first selected wins; 'defaults' = library defaults
    // (Phase B will wire library lookup; for now both paths fall back to
    // first-selected so the UX is in place.)
    const canonicalExpression = selectedForMerge[0].expression;

    // Deduplicated union of layers
    const allLayers = [];
    const seen = new Set();
    selectedForMerge.forEach(b => {
      b.layers.forEach(l => {
        if (!seen.has(l.id)) { seen.add(l.id); allLayers.push(l); }
      });
    });

    setStatus(`Merging ${selectedForMerge.length} bindings…`);
    try {
      const res = await evalScript('smartInject', {
        expression: canonicalExpression,
        targetProperty: matchName,
        layerIds: allLayers.map(l => l.id),
      });
      if (!res.success) {
        setStatus(`Error during merge: ${res.message}`);
        return;
      }
      setWorkbench(prev => {
        const current = prev[activeComp.id] || [];
        const kept = current.filter(b => !multiSelect.has(b.id));
        const merged = {
          id: `${Date.now()}-merge`,
          expression: canonicalExpression,
          matchName,
          displayName,
          layers: res.layers && res.layers.length ? res.layers : allLayers,
        };
        return { ...prev, [activeComp.id]: [...kept, merged] };
      });
      setStatus(`Merged ${selectedForMerge.length} bindings → ${displayName} (${allLayers.length} layers).`);
      setMultiSelect(new Set());
      setMergeOpen(false);
      setSelectedBindingId(null);
      setExpression("");
    } catch (e) {
      console.error(e);
      setStatus("Error during merge.");
    }
  };

  // Probe list for the error poll. Stable serialization so the effect doesn't
  // re-run on every render.
  const probesKey = useMemo(() => {
    return activeBindings
      .flatMap(b => b.layers.map(l => `${l.id}:${b.matchName}`))
      .sort()
      .join(',');
  }, [activeBindings]);

  // Poll AE for expressionError on every (layer, property) we track.
  useEffect(() => {
    if (!probesKey) {
      setErrorMap({});
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const probes = activeBindings.flatMap(b =>
        b.layers.map(l => ({ layerId: l.id, matchName: b.matchName }))
      );
      if (probes.length === 0) return;
      try {
        const res = await evalScript('checkExpressionErrors', { probes });
        if (cancelled || !res.success) return;
        const map = {};
        for (const r of res.results) {
          if (r.error) map[`${r.layerId}:${r.matchName}`] = r.error;
        }
        setErrorMap(map);
      } catch (e) {
        // Silent — error polling shouldn't disrupt the UI.
      }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(id); };
    // probesKey is the stable identity; activeBindings is captured by tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probesKey]);

  // Helper: does any layer in this binding have an error?
  const bindingHasError = (b) =>
    b.layers.some(l => errorMap[`${l.id}:${b.matchName}`]);

  // ESC clears multi-select / closes merge dialog
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (mergeOpen) setMergeOpen(false);
        else if (multiSelect.size > 0) setMultiSelect(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mergeOpen, multiSelect]);

  // --- Scan composition for existing expressions ---
  const handleScanComp = async () => {
    if (!activeComp.id) {
      setStatus("Error: no active composition to scan.");
      return;
    }
    setStatus("Scanning composition...");
    try {
      const res = await evalScript('scanCompositionExpressions');
      if (!res.success) {
        setStatus(`Error: ${res.message}`);
        return;
      }
      // Group by (matchName, expression). Mark existing-in-workbench.
      const groupMap = new Map();
      for (const r of res.results) {
        const key = `${r.matchName}::${r.expression}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            key,
            matchName: r.matchName,
            displayName: r.displayName,
            expression: r.expression,
            layers: [],
          });
        }
        const g = groupMap.get(key);
        if (!g.layers.some(l => l.id === r.layerId)) {
          g.layers.push({ id: r.layerId, name: r.layerName });
        }
      }
      const groups = Array.from(groupMap.values()).map(g => ({
        ...g,
        existing: activeBindings.some(b =>
          b.matchName === g.matchName && b.expression === g.expression
        ),
      }));

      if (groups.length === 0) {
        setStatus("Scan complete: no expressions found in this composition.");
        return;
      }

      // Pre-select all non-existing groups
      const initialSelection = {};
      groups.forEach(g => { initialSelection[g.key] = !g.existing; });
      setScanSelected(initialSelection);
      setScanGroups(groups);
      setStatus(`Found ${groups.length} expression group${groups.length === 1 ? '' : 's'}.`);
    } catch (e) {
      console.error(e);
      setStatus("Error scanning composition.");
    }
  };

  const handleScanImport = () => {
    if (!scanGroups || !activeComp.id) return;
    const toImport = scanGroups.filter(g => scanSelected[g.key] && !g.existing);
    if (toImport.length === 0) {
      setScanGroups(null);
      return;
    }
    setWorkbench(prev => {
      const current = prev[activeComp.id] || [];
      const additions = toImport.map((g, idx) => ({
        id: `${Date.now()}-${idx}`,
        expression: g.expression,
        matchName: g.matchName,
        displayName: g.displayName,
        layers: g.layers,
      }));
      return { ...prev, [activeComp.id]: [...current, ...additions] };
    });
    setStatus(`Imported ${toImport.length} binding${toImport.length === 1 ? '' : 's'}.`);
    setScanGroups(null);
    setScanSelected({});
  };

  // --- Add/remove layers on the active binding (A5) ---
  const handleAddSelectedLayersToBinding = async () => {
    if (!activeBindingData) return;
    setStatus("Adding selected layers…");
    try {
      const peek = await evalScript('peekSelection');
      if (!peek.success) {
        setStatus(`Error: ${peek.message}`);
        return;
      }
      // Filter out layers already in the binding
      const existingIds = new Set(activeBindingData.layers.map(l => l.id));
      const newLayers = peek.layers.filter(l => !existingIds.has(l.id));
      if (newLayers.length === 0) {
        setStatus("All selected layers are already in this binding.");
        return;
      }
      // Inject the binding's expression onto the new layers using its matchName
      const res = await evalScript('smartInject', {
        expression: activeBindingData.expression,
        targetProperty: activeBindingData.matchName,
        layerIds: newLayers.map(l => l.id),
      });
      if (!res.success) {
        setStatus(`Error: ${res.message}`);
        return;
      }
      const injectedLayers = res.layers && res.layers.length ? res.layers : newLayers;
      setWorkbench(prev => {
        const current = prev[activeComp.id] || [];
        return {
          ...prev,
          [activeComp.id]: current.map(b => {
            if (b.id !== activeBindingData.id) return b;
            const seen = new Set(b.layers.map(l => l.id));
            const merged = [...b.layers];
            injectedLayers.forEach(l => {
              if (!seen.has(l.id)) { seen.add(l.id); merged.push(l); }
            });
            return { ...b, layers: merged };
          }),
        };
      });
      setStatus(`Added ${injectedLayers.length} layer${injectedLayers.length === 1 ? '' : 's'}.`);
    } catch (e) {
      console.error(e);
      setStatus("Error adding layers.");
    }
  };

  const handleRemoveLayerFromBinding = async (layerId) => {
    if (!activeBindingData) return;
    setStatus("Removing layer…");
    try {
      const res = await evalScript('clearExpression', {
        matchName: activeBindingData.matchName,
        layerIds: [layerId],
      });
      if (!res.success) {
        setStatus(`Error: ${res.message}`);
        return;
      }
      setWorkbench(prev => {
        const current = prev[activeComp.id] || [];
        return {
          ...prev,
          [activeComp.id]: current
            .map(b => {
              if (b.id !== activeBindingData.id) return b;
              return { ...b, layers: b.layers.filter(l => l.id !== layerId) };
            })
            // Drop bindings that have no layers left
            .filter(b => b.layers.length > 0),
        };
      });
      // If the binding was emptied, close the modal and exit edit mode
      const remaining = activeBindingData.layers.length - 1;
      if (remaining === 0) {
        setIsLayersModalOpen(false);
        setSelectedBindingId(null);
        setExpression("");
        setStatus("Binding emptied and removed.");
      } else {
        setStatus(`Removed layer. ${remaining} remaining.`);
      }
    } catch (e) {
      console.error(e);
      setStatus("Error removing layer.");
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
        <div className="workbench-header-row">
          <button
            className="workbench-header"
            onClick={() => setWorkbenchOpen(o => !o)}
            aria-expanded={workbenchOpen}
          >
            <span className="chevron">▾</span>
            <span>Workbench</span>
            <span className="count-badge">{activeBindings.length}</span>
          </button>
          <button
            className="pill-btn scan-btn"
            onClick={handleScanComp}
            disabled={!activeComp.id}
            title="Scan the active comp for existing expressions"
          >
            ⟳ Scan
          </button>
        </div>

        {workbenchOpen && (
          <>
            {multiSelect.size > 0 && (
              <div className="merge-bar">
                <span className="merge-bar-count">{multiSelect.size} selected</span>
                {multiSelect.size === 1 && (
                  <span className="merge-bar-hint">Ctrl+click another to merge</span>
                )}
                {multiSelect.size >= 2 && (
                  <button className="btn-primary merge-btn" onClick={() => setMergeOpen(true)}>
                    Merge {multiSelect.size}
                  </button>
                )}
                <button className="link-action" onClick={() => setMultiSelect(new Set())}>Clear</button>
              </div>
            )}
            <div className="binding-list">
              {activeBindings.length === 0 ? (
                <div className="empty-state">No bindings in this composition.</div>
              ) : (
                activeBindings.map(binding => {
                  const isMulti = multiSelect.has(binding.id);
                  const classes = [
                    'binding-card',
                    selectedBindingId === binding.id ? 'selected' : '',
                    isMulti ? 'multi-selected' : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <div
                      key={binding.id}
                      className={classes}
                      onClick={(e) => handleSelectBinding(binding, e)}
                      title="Click to edit · Ctrl+click to multi-select for merge"
                    >
                      <div className="row">
                        {isMulti && <span className="multi-check">✓</span>}
                        {bindingHasError(binding) && (
                          <span className="error-dot" title="One or more layers report an AE expression error" />
                        )}
                        <span className="prop-name">{binding.displayName}</span>
                        <span className="layer-count">{binding.layers.length}L</span>
                      </div>
                      <div className="expr-preview">{binding.expression || <em>(empty)</em>}</div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </section>

      {scanGroups && (
        <div className="modal-backdrop" onClick={() => setScanGroups(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Scan results</h2>
              <button className="icon-btn" onClick={() => setScanGroups(null)} aria-label="Close">×</button>
            </div>
            <div className="modal-sub">
              Found <strong>{scanGroups.length}</strong> expression group{scanGroups.length === 1 ? '' : 's'}
              {' '}across <strong>{scanGroups.reduce((n, g) => n + g.layers.length, 0)}</strong> propert
              {scanGroups.reduce((n, g) => n + g.layers.length, 0) === 1 ? 'y' : 'ies'}.
            </div>
            <div className="scan-actions">
              <button className="link-action" onClick={() => {
                const all = {}; scanGroups.forEach(g => { all[g.key] = !g.existing; });
                setScanSelected(all);
              }}>Select new</button>
              <button className="link-action" onClick={() => setScanSelected({})}>Select none</button>
            </div>
            <div className="layer-list scan-list">
              {scanGroups.map(g => (
                <label key={g.key} className={`scan-row ${g.existing ? 'existing' : ''}`}>
                  <input
                    type="checkbox"
                    checked={!!scanSelected[g.key]}
                    disabled={g.existing}
                    onChange={(e) => setScanSelected(prev => ({ ...prev, [g.key]: e.target.checked }))}
                  />
                  <div className="scan-row-body">
                    <div className="scan-row-head">
                      <span className="prop-name">{g.displayName}</span>
                      <span className="layer-count">{g.layers.length}L</span>
                      {g.existing && <span className="badge badge-existing">In WB</span>}
                    </div>
                    <div className="expr-preview">{g.expression}</div>
                  </div>
                </label>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setScanGroups(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleScanImport}>
                Import {Object.values(scanSelected).filter(Boolean).length} selected
              </button>
            </div>
          </div>
        </div>
      )}

      {mergeOpen && selectedForMerge.length >= 2 && (
        <div className="modal-backdrop" onClick={() => setMergeOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Merge {selectedForMerge.length} bindings</h2>
              <button className="icon-btn" onClick={() => setMergeOpen(false)} aria-label="Close">×</button>
            </div>

            {mergeMatchNameConflict ? (
              <div className="merge-conflict">
                <strong>Different target properties.</strong> Bindings can only be merged when they target the same property. Selected:{' '}
                {[...new Set(selectedForMerge.map(b => b.displayName))].join(', ')}.
              </div>
            ) : (
              <>
                <div className="modal-sub">
                  Merging will lose some values. Set new ones as:
                </div>

                <div className="merge-options">
                  <button className="merge-option" onClick={() => handleMerge('fuzzy')}>
                    <div className="merge-option-title">Best guess (fuzzy)</div>
                    <div className="merge-option-desc">
                      Keep the first selected binding's values. Closest to what was there.
                    </div>
                  </button>
                  <button className="merge-option" onClick={() => handleMerge('defaults')}>
                    <div className="merge-option-title">App Defaults</div>
                    <div className="merge-option-desc">
                      Use the library snippet's defaults (falls back to first selected until Phase B ships).
                    </div>
                  </button>
                </div>

                <div className="merge-preview">
                  <div className="merge-preview-label">Bindings to merge</div>
                  <div className="layer-list">
                    {selectedForMerge.map(b => (
                      <div key={b.id} className="layer-item">
                        <span className="layer-id">{b.layers.length}L</span>
                        <span className="expr-preview" style={{ flex: 1 }}>{b.expression}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setMergeOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

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
            <div className="scan-actions">
              <button className="link-action" onClick={handleAddSelectedLayersToBinding}>
                + Add from timeline selection
              </button>
            </div>
            <div className="layer-list">
              {activeBindingData.layers.map((layer, idx) => {
                const err = errorMap[`${layer.id}:${activeBindingData.matchName}`];
                return (
                  <div key={idx} className={`layer-item ${err ? 'has-error' : ''}`}>
                    <div className="layer-item-row">
                      <span className="layer-id">#{layer.id}</span>
                      <span style={{ flex: 1 }}>{layer.name}</span>
                      <button
                        className="icon-btn layer-remove"
                        onClick={() => handleRemoveLayerFromBinding(layer.id)}
                        title="Remove this layer and clear its expression"
                        aria-label={`Remove ${layer.name}`}
                      >
                        ×
                      </button>
                    </div>
                    {err && (
                      <div className="layer-error" title={err}>{err}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
