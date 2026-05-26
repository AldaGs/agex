# agex - Global Expression Injector

**agex** is a context-aware Adobe After Effects CEP extension designed to streamline the management and bulk-injection of expressions. It replaces repetitive stopwatch-clicking with a smart, centralized "Workbench" and a native, dark-mode IDE experience.

## ✨ Core Features

* **Smart Timeline Extraction:** No need to manually type property match names or layer IDs. Simply highlight properties in the AE timeline, write your code, and click inject. agex automatically traverses the DOM to extract layer IDs and property names.
* **The Workbench (Context-Aware Bindings):** agex silently tracks your active composition. When you inject an expression, it saves the binding data as a card to the Workbench. Switching compositions automatically filters the Workbench to show only the expressions active in your current view.
* **Integrated Monaco Editor:** Write ExtendScript in a true IDE environment right inside After Effects, featuring syntax highlighting, auto-pairing, and code folding, powered by the core engine behind VS Code.
* **Conflict Prevention:** A built-in collision checker prevents you from accidentally injecting multiple master expressions into the same layer property, keeping your project architecture clean.
* **Layer Inspection:** A sub-dialog modal allows you to quickly view the exact layer names and immutable IDs linked to any active binding.

## 🛠 Tech Stack

* **Frontend:** React (via Vite)
* **Backend:** ExtendScript (ES3)
* **Bridge:** Adobe `CSInterface.js`
* **Editor:** `@monaco-editor/react` (bundled locally for offline use)

## 🚀 Installation & Setup (Developer Mode)

Because this is an unsigned, local development extension, you must enable PlayerDebugMode in the Windows Registry and symlink the project folder to Adobe's CEP directory.

### 1. Enable PlayerDebugMode
Open PowerShell and run the following command to blanket-enable debug mode for all modern After Effects versions (CSXS.11 through CSXS.16):
```powershell
11..16 | ForEach-Object { reg add "HKCU\Software\Adobe\CSXS.$_" /v PlayerDebugMode /t REG_SZ /d "1" /f }

```

### 2. Install Dependencies

Navigate to the project root and install the required NPM packages (including the local Monaco engine):

```bash
npm install
npm install monaco-editor @monaco-editor/react

```

### 3. Build the Frontend

CEP requires absolute file paths or a relative base. Vite is configured to output a relative build.

```bash
npm run build

```

*(Tip: Run `npm run build -- --watch` during active development to auto-compile React changes).*

### 4. Create the Adobe Symlink

Open **Command Prompt as Administrator** and create a directory symlink pointing from Adobe's AppData folder to your local project folder.

```cmd
mklink /D "C:\Users\<YourUsername>\AppData\Roaming\Adobe\CEP\extensions\agex" "C:\Path\To\Your\global-expression-injector"

```

*Note: Ensure the symlink points directly to the folder containing the `CSXS` directory and `manifest.xml`.*

### 5. Debugging

To open Chrome Developer Tools inside After Effects:

1. Ensure the `.debug` file is present in the project root containing the `<Host Name="AEFT" Port="8088" />` configuration.
2. Open the extension in After Effects.
3. Open a normal Chrome browser and navigate to `http://localhost:8088`.

## 📁 Project Structure

```text
global-expression-injector/
├── .debug                       # Exposes port 8088 for Chrome DevTools
├── CSXS/
│   └── manifest.xml             # Adobe extension configuration (ID: com.ag.agex)
├── public/
│   ├── CSInterface.js           # Adobe's frontend-to-backend bridge
│   └── jsx/
│       └── host.jsx             # ExtendScript backend logic
├── scripts/
│   └── build-dictionary.mjs     # Parses expression-globals-typescript → ae-dictionary.generated.json
├── src/
│   ├── App.jsx                  # Main React interface and state management
│   ├── App.css                  # CSS variables + component styles (no inline styles)
│   ├── ae-dictionary.js         # Monaco completion provider + hand-written AE entries
│   ├── ae-dictionary.generated.json  # Auto-generated AE globals (run `npm run build:dict`)
│   ├── cep-bridge.js            # Wrapper for CSInterface evaluation and JSON parsing
│   └── main.jsx                 # React DOM entry
├── CLAUDE.md                    # Engineering memo: locked decisions, conventions, contracts
├── package.json
└── vite.config.js               # Configured for relative base paths (./)

```

## 🗺 Roadmap

The full engineering plan, locked architectural decisions, and conventions live in [`CLAUDE.md`](CLAUDE.md). Public-facing summary:

### Phase A — Close the data loop
- [ ] **XMP-based persistence.** Workbench state serialized to `app.project.xmpPacket` under namespace `http://custom.ag.agex/` (prefix `agex:`). Two ExtendScript entry points (`saveWorkbenchState`, `loadWorkbenchState`) with debounced autosave and a dirty indicator in the topbar.
- [ ] **Scan composition.** Walk the active comp for properties with non-empty expressions and import them as Workbench bindings.
- [ ] **Unifier.** Group scanned bindings by identical expression; on merge prompt the user to set new defaults via "Best guess (fuzzy)" or "App Defaults".
- [ ] **Per-binding layer management.** Add/remove target layers on existing bindings without re-injecting from scratch.
- [ ] **Error surfacing.** Poll `property.expressionError` and flag broken bindings inline.

### Phase B — The Vault (library)
- [ ] **User library** at `%AppData%/Roaming/AG-Extensions/agex/lib/<slug>.json`, one file per snippet. No cloud logic — users symlink the folder if they want sync.
- [ ] **Bundled built-ins** ship read-only; editing forks the snippet to user space. A **Factory Reset** wipes user space.
- [ ] **Search + filter** by name, tag, and category.
- [ ] **Full CRUD inside agex.** New snippets enforce the parameter convention: top-of-snippet `let` declarations (`let frq = 10; let amp = 10; wiggle(frq, amp);`) so the Monaco editor itself is the parameter UI.
- [ ] **Click-to-insert** from library into the current editor buffer.

### Phase C — LLM assistance
- [ ] **Pluggable provider interface** with local-first default (Ollama on `localhost:11434`). Optional Claude / OpenAI providers.
- [ ] **Modeless "Help from LLM" dialog** for prompt-driven expression generation.
- [ ] **Auto-naming** of unnamed bindings on save (background, debounced).
- [ ] **Settings panel** at `%AppData%/Roaming/AG-Extensions/agex/config/` for provider selection.

### Phase D — Safety + polish
- [ ] **Workbench-level undo/redo** via keyboard shortcuts scoped to the extension UI (not Monaco's buffer, not AE itself).
- [ ] **Per-binding version history** — last 10 expression versions with timestamps.
- [ ] **Export/import** library bundles (zip of `lib/`) for manual sharing.
- [ ] **Accessibility pass** and remaining keyboard shortcuts.

### Already shipped
- Smart timeline extraction (smartInject)
- Context-aware Workbench filtered by active comp
- Layer-ID-based binding tracking (survives renames)
- Collision prevention on injection
- Layer inspection modal
- Monaco editor with AE-aware completions (built-in JS/TS suggestions suppressed)
- AE dictionary auto-generation from `expression-globals-typescript`
```