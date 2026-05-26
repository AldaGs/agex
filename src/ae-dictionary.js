import * as monaco from 'monaco-editor';

const K = monaco.languages.CompletionItemKind;
const R = monaco.languages.CompletionItemInsertTextRule;

// Generated entries from expression-globals-typescript. Empty until you run
// `npm run build:dict`. We fall back to [] when the file is missing.
let generatedEntries = [];
try {
  // Vite resolves this at build time. If the file doesn't exist, the import
  // throws and we silently use [].
  // eslint-disable-next-line import/no-unresolved
  const mod = await import('./ae-dictionary.generated.json');
  generatedEntries = (mod.default || []).map(mapGenerated);
} catch (_) {
  // No generated dictionary yet — that's fine.
}

function mapGenerated(entry) {
  const out = {
    label: entry.label,
    kind: K[entry.kind] ?? K.Text,
    insertText: entry.insertText,
    detail: entry.detail,
    documentation: entry.documentation,
  };
  if (entry.insertTextRules) out.insertTextRules = R[entry.insertTextRules] ?? 0;
  return out;
}

/**
 * AE expression dictionary.
 * Each entry is a Monaco CompletionItem (minus `range`, which we attach per-request).
 * Grouped by section for readability. Order does not affect ranking.
 */
export const aeCompletions = [
  // --- Global objects ---
  { label: 'time', kind: K.Variable, insertText: 'time',
    detail: 'number',
    documentation: 'Current composition time in seconds.' },
  { label: 'value', kind: K.Variable, insertText: 'value',
    detail: 'any',
    documentation: 'The pre-expression value of the property at the current time.' },
  { label: 'thisComp', kind: K.Variable, insertText: 'thisComp',
    detail: 'Comp',
    documentation: 'The composition containing the expression.' },
  { label: 'thisLayer', kind: K.Variable, insertText: 'thisLayer',
    detail: 'Layer',
    documentation: 'The layer containing the expression. Optional — methods resolve against it implicitly.' },
  { label: 'thisProperty', kind: K.Variable, insertText: 'thisProperty',
    detail: 'Property',
    documentation: 'The property containing the expression.' },
  { label: 'colorDepth', kind: K.Variable, insertText: 'colorDepth',
    detail: 'number',
    documentation: 'Project color depth in bits (8, 16, or 32).' },

  // --- Time / interpolation ---
  { label: 'valueAtTime', kind: K.Function,
    insertText: 'valueAtTime(${1:t})', insertTextRules: R.InsertAsSnippet,
    detail: '(t: number) ⇒ value',
    documentation: 'Property value at time t (seconds).' },
  { label: 'velocityAtTime', kind: K.Function,
    insertText: 'velocityAtTime(${1:t})', insertTextRules: R.InsertAsSnippet,
    detail: '(t: number) ⇒ value',
    documentation: 'Temporal velocity at time t.' },
  { label: 'speedAtTime', kind: K.Function,
    insertText: 'speedAtTime(${1:t})', insertTextRules: R.InsertAsSnippet,
    detail: '(t: number) ⇒ number' },
  { label: 'linear', kind: K.Function,
    insertText: 'linear(${1:t}, ${2:tMin}, ${3:tMax}, ${4:value1}, ${5:value2})',
    insertTextRules: R.InsertAsSnippet,
    detail: 'remap a value linearly',
    documentation: 'Maps t from [tMin, tMax] to [value1, value2] linearly.' },
  { label: 'ease', kind: K.Function,
    insertText: 'ease(${1:t}, ${2:tMin}, ${3:tMax}, ${4:value1}, ${5:value2})',
    insertTextRules: R.InsertAsSnippet,
    detail: 'remap with ease in/out' },
  { label: 'easeIn', kind: K.Function,
    insertText: 'easeIn(${1:t}, ${2:tMin}, ${3:tMax}, ${4:value1}, ${5:value2})',
    insertTextRules: R.InsertAsSnippet },
  { label: 'easeOut', kind: K.Function,
    insertText: 'easeOut(${1:t}, ${2:tMin}, ${3:tMax}, ${4:value1}, ${5:value2})',
    insertTextRules: R.InsertAsSnippet },

  // --- Randomness ---
  { label: 'wiggle', kind: K.Function,
    insertText: 'wiggle(${1:freq}, ${2:amp})', insertTextRules: R.InsertAsSnippet,
    detail: '(freq, amp[, octaves, amp_mult, t]) ⇒ value',
    documentation: 'Randomly wiggles the property around its current value.' },
  { label: 'random', kind: K.Function,
    insertText: 'random(${1:minOrMax})', insertTextRules: R.InsertAsSnippet,
    detail: '() | (max) | (min, max) ⇒ number' },
  { label: 'gaussRandom', kind: K.Function,
    insertText: 'gaussRandom(${1:min}, ${2:max})', insertTextRules: R.InsertAsSnippet },
  { label: 'seedRandom', kind: K.Function,
    insertText: 'seedRandom(${1:offset}, ${2:timeless})', insertTextRules: R.InsertAsSnippet,
    documentation: 'Pin the random seed so wiggle/random stay stable.' },
  { label: 'noise', kind: K.Function,
    insertText: 'noise(${1:value})', insertTextRules: R.InsertAsSnippet,
    documentation: 'Perlin-style noise in [-1, 1].' },

  // --- Looping & timing ---
  { label: 'loopIn', kind: K.Function,
    insertText: 'loopIn("${1|cycle,pingpong,offset,continue|}", ${2:0})',
    insertTextRules: R.InsertAsSnippet,
    detail: '(type, numKeyframes)' },
  { label: 'loopOut', kind: K.Function,
    insertText: 'loopOut("${1|cycle,pingpong,offset,continue|}", ${2:0})',
    insertTextRules: R.InsertAsSnippet,
    detail: '(type, numKeyframes)' },
  { label: 'loopInDuration', kind: K.Function,
    insertText: 'loopInDuration("${1|cycle,pingpong,offset,continue|}", ${2:0})',
    insertTextRules: R.InsertAsSnippet },
  { label: 'loopOutDuration', kind: K.Function,
    insertText: 'loopOutDuration("${1|cycle,pingpong,offset,continue|}", ${2:0})',
    insertTextRules: R.InsertAsSnippet },
  { label: 'posterizeTime', kind: K.Function,
    insertText: 'posterizeTime(${1:fps})', insertTextRules: R.InsertAsSnippet,
    documentation: 'Quantize time to fps. Place at the top of the expression.' },
  { label: 'framesToTime', kind: K.Function,
    insertText: 'framesToTime(${1:frames})', insertTextRules: R.InsertAsSnippet },
  { label: 'timeToFrames', kind: K.Function,
    insertText: 'timeToFrames(${1:t})', insertTextRules: R.InsertAsSnippet },

  // --- Math helpers ---
  { label: 'clamp', kind: K.Function,
    insertText: 'clamp(${1:value}, ${2:limit1}, ${3:limit2})', insertTextRules: R.InsertAsSnippet },
  { label: 'degreesToRadians', kind: K.Function,
    insertText: 'degreesToRadians(${1:degrees})', insertTextRules: R.InsertAsSnippet },
  { label: 'radiansToDegrees', kind: K.Function,
    insertText: 'radiansToDegrees(${1:radians})', insertTextRules: R.InsertAsSnippet },
  { label: 'length', kind: K.Function,
    insertText: 'length(${1:point1}, ${2:point2})', insertTextRules: R.InsertAsSnippet,
    detail: '(point1[, point2]) ⇒ number' },
  { label: 'lookAt', kind: K.Function,
    insertText: 'lookAt(${1:fromPoint}, ${2:atPoint})', insertTextRules: R.InsertAsSnippet,
    documentation: 'Returns 3D rotation that aims fromPoint toward atPoint.' },

  // --- Layer / comp access ---
  { label: 'layer', kind: K.Function,
    insertText: 'thisComp.layer("${1:name}")', insertTextRules: R.InsertAsSnippet,
    detail: 'thisComp.layer(name|index|relative)' },
  { label: 'nearestKey', kind: K.Function,
    insertText: 'nearestKey(${1:time})', insertTextRules: R.InsertAsSnippet,
    detail: '(t) ⇒ Key' },
  { label: 'numKeys', kind: K.Variable, insertText: 'numKeys',
    detail: 'number',
    documentation: 'Number of keyframes on this property.' },

  // --- JS standard library (whitelisted subset that AE expressions actually use) ---
  { label: 'Math', kind: K.Module, insertText: 'Math', detail: 'Math namespace' },
  { label: 'Math.PI', kind: K.Constant, insertText: 'Math.PI', detail: 'number ≈ 3.14159' },
  { label: 'Math.E', kind: K.Constant, insertText: 'Math.E', detail: 'number ≈ 2.71828' },
  { label: 'Math.abs', kind: K.Function,
    insertText: 'Math.abs(${1:x})', insertTextRules: R.InsertAsSnippet, detail: '(x) ⇒ number' },
  { label: 'Math.floor', kind: K.Function,
    insertText: 'Math.floor(${1:x})', insertTextRules: R.InsertAsSnippet },
  { label: 'Math.ceil', kind: K.Function,
    insertText: 'Math.ceil(${1:x})', insertTextRules: R.InsertAsSnippet },
  { label: 'Math.round', kind: K.Function,
    insertText: 'Math.round(${1:x})', insertTextRules: R.InsertAsSnippet },
  { label: 'Math.min', kind: K.Function,
    insertText: 'Math.min(${1:a}, ${2:b})', insertTextRules: R.InsertAsSnippet },
  { label: 'Math.max', kind: K.Function,
    insertText: 'Math.max(${1:a}, ${2:b})', insertTextRules: R.InsertAsSnippet },
  { label: 'Math.pow', kind: K.Function,
    insertText: 'Math.pow(${1:base}, ${2:exp})', insertTextRules: R.InsertAsSnippet },
  { label: 'Math.sqrt', kind: K.Function,
    insertText: 'Math.sqrt(${1:x})', insertTextRules: R.InsertAsSnippet },
  { label: 'Math.exp', kind: K.Function,
    insertText: 'Math.exp(${1:x})', insertTextRules: R.InsertAsSnippet },
  { label: 'Math.log', kind: K.Function,
    insertText: 'Math.log(${1:x})', insertTextRules: R.InsertAsSnippet },
  { label: 'Math.sin', kind: K.Function,
    insertText: 'Math.sin(${1:rad})', insertTextRules: R.InsertAsSnippet },
  { label: 'Math.cos', kind: K.Function,
    insertText: 'Math.cos(${1:rad})', insertTextRules: R.InsertAsSnippet },
  { label: 'Math.tan', kind: K.Function,
    insertText: 'Math.tan(${1:rad})', insertTextRules: R.InsertAsSnippet },
  { label: 'Math.asin', kind: K.Function,
    insertText: 'Math.asin(${1:x})', insertTextRules: R.InsertAsSnippet },
  { label: 'Math.acos', kind: K.Function,
    insertText: 'Math.acos(${1:x})', insertTextRules: R.InsertAsSnippet },
  { label: 'Math.atan', kind: K.Function,
    insertText: 'Math.atan(${1:x})', insertTextRules: R.InsertAsSnippet },
  { label: 'Math.atan2', kind: K.Function,
    insertText: 'Math.atan2(${1:y}, ${2:x})', insertTextRules: R.InsertAsSnippet },
  { label: 'Math.random', kind: K.Function,
    insertText: 'Math.random()', detail: '⇒ number in [0, 1)',
    documentation: 'Prefer AE\'s `random()` / `seedRandom()` for stable, time-aware randomness.' },

  { label: 'parseInt', kind: K.Function,
    insertText: 'parseInt(${1:str}, ${2:10})', insertTextRules: R.InsertAsSnippet },
  { label: 'parseFloat', kind: K.Function,
    insertText: 'parseFloat(${1:str})', insertTextRules: R.InsertAsSnippet },
  { label: 'isNaN', kind: K.Function,
    insertText: 'isNaN(${1:x})', insertTextRules: R.InsertAsSnippet },
  { label: 'isFinite', kind: K.Function,
    insertText: 'isFinite(${1:x})', insertTextRules: R.InsertAsSnippet },

  { label: 'JSON', kind: K.Module, insertText: 'JSON', detail: 'JSON namespace' },
  { label: 'JSON.stringify', kind: K.Function,
    insertText: 'JSON.stringify(${1:value})', insertTextRules: R.InsertAsSnippet },
  { label: 'JSON.parse', kind: K.Function,
    insertText: 'JSON.parse(${1:str})', insertTextRules: R.InsertAsSnippet },

  { label: 'Array.isArray', kind: K.Function,
    insertText: 'Array.isArray(${1:x})', insertTextRules: R.InsertAsSnippet },
  { label: 'Object.keys', kind: K.Function,
    insertText: 'Object.keys(${1:obj})', insertTextRules: R.InsertAsSnippet },
  { label: 'Object.values', kind: K.Function,
    insertText: 'Object.values(${1:obj})', insertTextRules: R.InsertAsSnippet },
  { label: 'String.fromCharCode', kind: K.Function,
    insertText: 'String.fromCharCode(${1:code})', insertTextRules: R.InsertAsSnippet },

  // --- Multi-line snippets ---
  {
    label: 'bounce',
    kind: K.Snippet,
    insertText: [
      'amp = ${1:0.1};',
      'freq = ${2:2.0};',
      'decay = ${3:2.0};',
      'n = 0;',
      'if (numKeys > 0) {',
      '\tn = nearestKey(time).index;',
      '\tif (key(n).time > time) n--;',
      '}',
      'if (n == 0) { t = 0; } else { t = time - key(n).time; }',
      'if (n > 0) {',
      '\tv = velocityAtTime(key(n).time - thisComp.frameDuration/10);',
      '\tvalue + v*amp*Math.sin(freq*t*2*Math.PI)/Math.exp(decay*t);',
      '} else { value; }'
    ].join('\n'),
    insertTextRules: R.InsertAsSnippet,
    detail: 'Inertial bounce',
    documentation: 'Classic bounce after the last keyframe.'
  },
  {
    label: 'overshoot',
    kind: K.Snippet,
    insertText: [
      'freq = ${1:3};',
      'decay = ${2:5};',
      'n = 0;',
      'if (numKeys > 0) {',
      '\tn = nearestKey(time).index;',
      '\tif (key(n).time > time) n--;',
      '}',
      'if (n > 0) {',
      '\tt = time - key(n).time;',
      '\tamp = velocityAtTime(key(n).time - thisComp.frameDuration/10);',
      '\tw = freq*Math.PI*2;',
      '\tvalue + amp*(Math.sin(t*w)/Math.exp(decay*t)/w);',
      '} else { value; }'
    ].join('\n'),
    insertTextRules: R.InsertAsSnippet,
    detail: 'Spring overshoot'
  },
];

let registered = false;

/**
 * Register the AE completion provider on a Monaco instance.
 * Safe to call multiple times — only registers once per page lifetime.
 */
export function registerAECompletions(monacoInstance) {
  if (registered) return;
  registered = true;

  // Suppress Monaco's built-in JS/TS completion contributor so only our
  // AE dictionary shows up. Syntax highlighting, bracket matching, and
  // formatting stay intact.
  if (monacoInstance.languages.typescript?.javascriptDefaults) {
    monacoInstance.languages.typescript.javascriptDefaults.setModeConfiguration({
      completionItems: false,
      hovers: true,
      documentSymbols: true,
      definitions: false,
      references: false,
      documentHighlights: false,
      rename: false,
      diagnostics: false,
      documentRangeFormattingEdits: true,
      signatureHelp: false,
      onTypeFormattingEdits: true,
      codeActions: false,
      inlayHints: false,
    });
  }

  // Hand-written entries win on label collisions.
  const handLabels = new Set(aeCompletions.map(c => c.label));
  const merged = [
    ...aeCompletions,
    ...generatedEntries.filter(g => !handLabels.has(g.label)),
  ];

  monacoInstance.languages.registerCompletionItemProvider('javascript', {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      return {
        suggestions: merged.map(c => ({ ...c, range })),
      };
    },
  });
}
