# agex — Global Expression Injector

**agex** is a context-aware Adobe After Effects CEP extension for managing and bulk-injecting expressions. It replaces repetitive stopwatch-clicking with a smart, centralized **Workbench**, a snippet **Vault**, an **AI agent**, and a native dark-mode IDE — all inside the AE panel.

---

## ✨ Features

### Workbench (context-aware bindings)
- **Smart timeline extraction** — select properties in the timeline, write code, click Add. agex walks the DOM, captures layer IDs + match names automatically.
- **Comp-scoped filtering** — bindings are silently tracked per composition; switching comps switches the view.
- **Layer-ID tracking** — bindings survive layer renames, reordering, and most edits.
- **Add / remove layers** on existing bindings without re-injecting from scratch.
- **Per-card delete** — the × on a card clears the AE-side expression on all its layers and drops the card.
- **Multi-property per layer** — a single layer can carry Position + Rotation + Scale + Opacity as four separate bindings.
- **Multi-select merge** — Ctrl/Cmd-click two or more bindings, choose **Best guess (fuzzy)** or **App Defaults** to consolidate.
- **Scan composition** — walks the entire comp for existing expressions and imports them as bindings, grouping byte-identical expressions automatically.
- **Inline error surfacing** — AE's `expressionError` is polled every 2 s; broken bindings get a red dot and the actual error message in the layers modal.

### Persistence
- **XMP-embedded state** — Workbench state JSON is stored inside the `.aep`'s XMP packet under namespace `http://custom.ag.agex/` (prefix `agex:`). No sidecar files, no external database.
- **Debounced autosave** — 500 ms after any mutation. A pulsing dot in the topbar marks in-memory drift.
- **Crash-recovery log** — every save also mirrors to `%AppData%/Roaming/AG-Extensions/agex/log/current-state.json`; wiped on project switch.
- **"Saved HH:MM"** indicator reads the on-disk `.aep` mtime via `app.project.file.modified`.

### The Vault (snippet library)
- **File-per-snippet** at `%AppData%/Roaming/AG-Extensions/agex/lib/<slug>.json`. No cloud logic — symlink the folder to Dropbox/etc. if you want sync.
- **10 bundled built-ins** across Randomness, Looping, Springs, Easing, Time, Math.
- **Editing a built-in forks it** to user space with `source: "user"`; the original stays visible.
- **Parameter convention** — snippets declare parameters as top-of-body `let` statements; the Monaco editor itself is the param UI.
- **Search + category chips + tags**.
- **CRUD UI** — create, edit, delete, fork-to-user.
- **Click-to-insert** at the Monaco cursor (replaces selection if any).
- **Export / Import** bundles via native OS file dialogs (single versioned JSON).
- **Factory Reset** wipes `lib/` and `config/` — built-ins re-emerge pristine.

### Ask Agent (LLM assistance)
- **Pluggable provider interface** with three providers shipped:
  - **Ollama (local, default)** — `http://localhost:11434`, recommended model `qwen2.5-coder:7b`
  - **Claude (Anthropic)** — direct browser-origin calls with proper headers
  - **OpenAI** — chat completions
- **Modeless dialog** with prompt textarea + Ctrl+Enter generate. Preserves your last prompt and result across opens.
- **Read-only Monaco viewer** for results — syntax highlighting, line numbers, soft wrap, horizontal scroll.
- **Context-aware prompts** — the target property name + your current expression buffer are sent as context.
- **Background auto-naming** — new bindings receive a friendly 2-5-word label from the LLM on a serial queue (no parallel hammering of local models). Toggle in Settings.

### Monaco editor
- AE expression dictionary (`time`, `value`, `thisComp`, `wiggle`, `valueAtTime`, …) plus a curated subset of JS stdlib (`Math.*`, `JSON.*`, etc.).
- **Built-in JS/TS completion suppressed** so suggestions stay AE-relevant.
- Dictionary auto-generates from [`expression-globals-typescript`](https://github.com/motiondeveloper/expression-globals-typescript) via `npm run build:dict`.
- Multi-line snippets like *inertial bounce* and *spring overshoot* with tab-stop parameters.

### Safety & history
- **Workbench undo/redo** — full-state snapshots, cap 50, ↶ / ↷ pills in the workbench header. Ctrl+Z / Ctrl+Y. Resets on project switch.
- **Per-binding version history** — last 10 expression versions per binding with timestamps. ⌚ N pill in the editor header opens a viewer with Restore.

### UX
- Narrow-panel-first layout (single column at ≤ 400 px; auto-grids to 2–3 columns when the panel is wider).
- Color-coded status pill (idle / ok / busy / error) with `aria-live` for screen readers.
- All major modals are `role="dialog" aria-modal="true"`.

---

## ⌨️ Keyboard shortcuts

| Shortcut | Action | Scope |
|---|---|---|
| `Ctrl+S` | Force-flush autosave to XMP | global (even inside Monaco) |
| `Ctrl+L` | Open Library | global |
| `Ctrl+K` | Open Ask Agent | global |
| `Ctrl+,` | Open Settings | global |
| `Ctrl+Z` | Workbench undo | extension UI only |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Workbench redo | extension UI only |
| `Ctrl+Enter` | Generate (inside Ask Agent prompt) | dialog-local |
| `Esc` | Close current modal / clear multi-select | context |
| Click | Load binding into editor | Workbench |
| Ctrl/Cmd + Click | Toggle binding for merge | Workbench |

---

## 🛠 Tech stack

- **Frontend:** React 19 + Vite 8, Monaco editor (`@monaco-editor/react`), lucide-react icons — all bundled, no runtime CDN.
- **Bridge:** Adobe `CSInterface.js` → ExtendScript host.
- **Backend (host):** ExtendScript (ES3) in `public/jsx/host.jsx`. No Node.js runtime usage.
- **Persistence:** Adobe XMP (`app.project.xmpPacket`) via `lib:AdobeXMPScript`.
- **LLM:** plain `fetch` from CEP's Chromium to Ollama / Anthropic / OpenAI.

---

## 🚀 Installation & setup

### 1. Enable PlayerDebugMode

CEP requires this for any unsigned local extension. Open PowerShell:

```powershell
11..16 | ForEach-Object { reg add "HKCU\Software\Adobe\CSXS.$_" /v PlayerDebugMode /t REG_SZ /d "1" /f }
```

### 2. Install dependencies and build

```bash
npm install
npm run build
```

Tip: `npm run build -- --watch` rebuilds on save during active development.

### 3. (Optional) Generate the full AE dictionary

The repo ships with a curated hand-written set of completions. To merge in the full set parsed from `expression-globals-typescript`:

```bash
npm run build:dict
npm run build
```

The generated file (`src/ae-dictionary.generated.json`) is gitignored — regenerate as needed.

### 4. Symlink into Adobe's CEP folder

Open **Command Prompt as Administrator**:

```cmd
mklink /D "C:\Users\<YourUsername>\AppData\Roaming\Adobe\CEP\extensions\agex" "C:\Path\To\Your\agex"
```

The symlink must point at the folder containing `CSXS/manifest.xml`.

### 5. Open in After Effects

Window → Extensions → agex.

### 6. (Optional) Configure LLM

Click the gear ⚙ in the topbar.

- **Ollama (recommended for local use)** — install [Ollama](https://ollama.com), then:
  ```bash
  ollama pull qwen2.5-coder:7b
  # Allow CEP's file:// origin to call Ollama:
  set OLLAMA_ORIGINS=*       # Windows (cmd)
  $env:OLLAMA_ORIGINS = "*"  # PowerShell
  ollama serve
  ```
  In Settings: endpoint `http://localhost:11434`, model `qwen2.5-coder:7b`, **Test connection**.
- **Claude** — paste an `sk-ant-…` key from [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys).
- **OpenAI** — paste an `sk-…` key with billing configured.

### Debugging the panel

A `.debug` file in the project root exposes Chrome DevTools on port 8088. Open any Chrome window → `http://localhost:8088` → click the agex panel target.

---

## 📁 Project structure

```text
agex/
├── .debug                              # Exposes port 8088 for DevTools
├── CSXS/manifest.xml                   # Extension manifest (ID: com.ag.agex)
├── public/
│   ├── CSInterface.js                  # Adobe bridge
│   └── jsx/host.jsx                    # All ExtendScript host functions
├── scripts/
│   └── build-dictionary.mjs            # AE dictionary generator (TS AST walk)
├── src/
│   ├── App.jsx                         # Root component + state
│   ├── App.css                         # All styles (CSS variables, no inline)
│   ├── main.jsx                        # React DOM entry
│   ├── cep-bridge.js                   # evalScript() wrapper
│   ├── ae-dictionary.js                # Monaco completion provider + hand-written entries
│   ├── ae-dictionary.generated.json    # Generated AE globals (gitignored)
│   ├── vault.js                        # Library data layer (load/save/import/export)
│   ├── builtins/snippets.json          # Bundled built-in snippets
│   ├── Library.jsx                     # Vault browser + CRUD
│   ├── Settings.jsx                    # Provider configuration
│   ├── LLMDialog.jsx                   # Ask Agent dialog
│   ├── VersionHistory.jsx              # Per-binding version viewer
│   └── llm/
│       ├── provider.js                 # Base class + shared system prompts
│       ├── ollama.js                   # Local provider (default)
│       ├── claude.js                   # Anthropic provider
│       ├── openai.js                   # OpenAI provider
│       ├── config.js                   # Settings load/save
│       └── index.js                    # Registry + getActiveProvider()
├── CLAUDE.md                           # Engineering memo (decisions, conventions, contracts)
├── package.json
└── vite.config.js
```

User data lives at `%AppData%/Roaming/AG-Extensions/agex/`:
- `lib/<slug>.json` — user snippets
- `config/llm.json` — provider settings
- `log/current-state.json` — crash-recovery mirror of latest Workbench state

---

## 🗺 Roadmap

The original four-phase plan (A–D) has all shipped. Future ideas that surfaced during build:

- Param-form UI for `let X = Y;` declarations (slider/picker per param) — currently the editor itself fills this role.
- Drag-to-reorder bindings.
- Per-comp undo history (currently global per session).
- Encrypted API keys at rest.
- Friendlier upstream-error mapping (e.g. detect Claude 401 / OpenAI 429 → inline "Open Settings" action).
- Fuzzy unifier (currently exact-string match).

Engineering details and locked decisions live in [`CLAUDE.md`](CLAUDE.md).

---

## 📄 License

This project is provided as-is for personal and educational use. After Effects, ExtendScript, and CEP are trademarks of Adobe Inc. and used here under their standard developer terms.
