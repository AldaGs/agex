# agex — agent memory

Architectural decisions, conventions, and contracts. Keep terse. Update when decisions change.

## Mission

Adobe After Effects CEP extension for managing and bulk-injecting expressions. Context-aware Workbench (comp-scoped bindings), Monaco editor, persistent state, user library, optional local-LLM assistance.

## Stack

- **Frontend:** React 19 + Vite 8, single SPA loaded in CEP panel
- **Bridge:** Adobe CSInterface.js, ExtendScript (ES3) host
- **Editor:** `@monaco-editor/react` + `monaco-editor` (bundled locally; offline)
- **No Node.js runtime usage** — all backend ops go through ExtendScript

## Locked architectural decisions

### Persistence (replaces earlier sidecar plan)

State persists inside the `.aep` binary via **Adobe XMP**:

- Namespace URI: `http://custom.ag.agex/`
- Prefix: `agex:`
- Mechanism: `ExternalObject('lib:AdobeXMPScript')`, read/write `app.project.xmpPacket`
- ExtendScript API (in `host.jsx`):
  - `saveWorkbenchState(jsonString)` — merges into XMP packet
  - `loadWorkbenchState()` — returns the stored JSON string (or empty success-false)
- ExternalObject lifecycle: load once via module-level singleton flag, never re-instantiate; wrap in try/catch
- React state → `JSON.stringify` → save
- Save trigger: **debounced ~500ms** after any Workbench mutation
- XMP is in-memory in AE until the user saves the project. Surface a **dirty indicator** in the topbar to communicate this.
- Project-change detection: poll `app.project.file?.fsName`; on change, `loadWorkbenchState()` and rehydrate.

### Library (the Vault)

- Location: `%AppData%/Roaming/AG-Extensions/agex/lib/<slug>.json` (one file per snippet)
- Split storage: `lib/` for snippets, `config/` for extension/provider settings — never mix
- No cloud / sync logic. Users symlink the folder themselves if they want Dropbox/etc.
- Built-ins ship in the extension bundle and are **immutable**
- Editing a built-in **forks it to user space**; the original remains visible/restorable
- Factory Reset = wipe user-space `lib/` and `config/`
- Snippet schema:
  ```jsonc
  {
    "id": "wiggle-basic",
    "name": "Wiggle (basic)",
    "description": "Standard wiggle with adjustable frequency and amplitude.",
    "tags": ["wiggle", "noise", "motion"],
    "category": "Randomness",
    "body": "let frq = 10;\nlet amp = 10;\nwiggle(frq, amp);",
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-01-01T00:00:00Z",
    "source": "builtin"   // "builtin" | "user"
  }
  ```
- **Snippet convention:** parameters declared as top-of-snippet `let` statements rather than function args. The Monaco editor itself becomes the parameter UI — no popovers, no extra forms.

### Unifier (scan + merge)

Scanning a comp imports existing expressions into Workbench bindings. When ≥2 properties share the same expression, prompt the user:

> "Merging will lose some values. Set new ones as: **Best guess (fuzzy)** or **App Defaults**"

- v1 grouping: **exact string match**
- Future: fuzzy normalization (whitespace/comments stripped)
- "App Defaults" uses the snippet schema's default values from `lib/` if a known snippet, else first-occurrence values

### Versioning + undo/redo (three independent axes)

1. **Editor undo** — Monaco's built-in (Ctrl+Z inside the editor). Free.
2. **Workbench undo/redo** — history stack of Workbench state snapshots (cap 50, dedupe). Triggered by keyboard shortcuts **scoped to the extension UI only** (i.e. don't intercept Ctrl+Z when AE has focus or Monaco has focus).
3. **Per-binding version history** — keep last 10 expression versions per binding with timestamps. Visible in a "history" submenu on each card.

### LLM integration

- Pluggable provider interface, local-first
- Entry point: a **modeless "Help from LLM"** dialog
- Background usage: auto-naming for unsaved/unnamed bindings (debounced)
- Provider interface:
  ```ts
  interface LLMProvider {
    name: string;
    generateExpression(prompt: string, context: object): Promise<string>;
    autoName(expression: string): Promise<string>;
  }
  ```
- Default: `OllamaProvider` (HTTP to `localhost:11434`, recommended model: Qwen2.5-Coder 7B)
- Optional: `ClaudeProvider`, `OpenAIProvider`
- Provider selection + endpoints/keys stored in `%AppData%/Roaming/AG-Extensions/agex/config/llm.json`

## Roadmap phases

**Phase A — Close the data loop**
1. XMP persistence (save + load + project-change detect + debounced autosave + dirty indicator)
2. Scan composition → import existing expressions
3. Unifier with fuzzy/defaults choice dialog
4. Add/remove layers on existing bindings
5. Surface AE expression errors (poll `property.expressionError`)

**Phase B — Library (Vault)**
1. AppData `lib/` directory + file-per-snippet schema
2. Bundled built-ins (read-only); user-space forks on edit
3. Search bar + tag/category filter
4. CRUD UI; enforce `let`-at-top parameter convention
5. Click-to-insert into editor
6. Factory Reset action

**Phase C — Intelligence**
1. Pluggable LLM interface + Ollama provider
2. "Help from LLM" modeless dialog
3. Auto-name unsaved bindings (background, debounced)
4. Settings panel for provider selection
5. Optional Claude / OpenAI providers

**Phase D — Safety + polish**
1. Workbench-level undo/redo (UI-scoped shortcuts)
2. Per-binding version history (last 10)
3. Keyboard shortcuts overall
4. Export/import library bundle (zip of `lib/`)
5. Accessibility pass

## Conventions

- **Inline styles are banned** — all styles in `App.css` using the existing CSS variable tokens.
- **All host calls** go through `evalScript()` in `src/cep-bridge.js` and return parsed JSON.
- **ExtendScript** must remain ES3-compatible (`var`, no arrow fns, no `let/const`, no template literals).
- **JSON serialization in host.jsx** is hand-built (no `JSON.stringify` in ES3 environments — ExtendScript supports it in modern AE but we've been manually building strings for safety; keep that convention).
- **Monaco completion**: built-in JS/TS completion provider is **disabled**; AE dictionary is the sole source. Hand-written `aeCompletions` win over generated entries on label collision.
- **Snippets format**: parameters at top via `let X = Y;`, never inline args.
- **No emojis in code or files** unless explicitly requested.
- **README is user-facing**; CLAUDE.md is the dense engineering memo.

## Open questions parked for later

- XMP packet size ceiling under heavy use (10k+ bindings) — unknown, probably never hit
- Fuzzy match algorithm choice (Levenshtein vs. AST normalization) — defer to Phase A.3 refinement
- Whether to ship a "starter pack" of ~50 built-in snippets or start sparse

## Maybe-someday (deliberately off the roadmap)

- **Active LLM agent (inline ghost-text completions, Copilot-style).** Monaco supports `registerInlineCompletionsProvider`; the existing provider layer could add a `complete(prefix, context)` method. Blocker is UX, not architecture: latency on local 7B models is borderline (1–3s/req), and cancellation/debouncing have to be tight. Opt-in only, Ollama-only at first, would be the safe approach. Recorded as "probably" — revisit if a user explicitly asks.
