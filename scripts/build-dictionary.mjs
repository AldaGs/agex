/**
 * Parses `expression-globals-typescript` and emits a Monaco-friendly
 * completion list at src/ae-dictionary.generated.json.
 *
 * Usage:   npm run build:dict
 *
 * The generated JSON is read at runtime by ae-dictionary.js, which maps
 * `kind` / `insertTextRules` strings to Monaco enum values and merges
 * the result with the hand-written entries (hand-written wins on label
 * collisions).
 */

import ts from 'typescript';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const pkgRoot = path.join(projectRoot, 'node_modules', 'expression-globals-typescript');

if (!fs.existsSync(pkgRoot)) {
  console.error('expression-globals-typescript not installed. Run:');
  console.error('  npm i -D expression-globals-typescript typescript');
  process.exit(1);
}

// Find the source directory. The package layout has shifted across versions;
// try the common candidates.
const srcCandidates = [
  path.join(pkgRoot, 'src'),
  path.join(pkgRoot, 'dist'),
  pkgRoot,
];
const srcDir = srcCandidates.find(p =>
  fs.existsSync(p) && fs.readdirSync(p).some(f => f.endsWith('.ts') || f.endsWith('.d.ts'))
);

if (!srcDir) {
  console.error('Could not locate .ts/.d.ts files in', pkgRoot);
  process.exit(1);
}

const tsFiles = walk(srcDir).filter(f => /\.ts$/.test(f));
console.log(`Parsing ${tsFiles.length} files from ${path.relative(projectRoot, srcDir)}/`);

const program = ts.createProgram(tsFiles, {
  allowJs: false,
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  skipLibCheck: true,
  noResolve: false,
});

const out = [];
const seen = new Set();

for (const src of program.getSourceFiles()) {
  if (!src.fileName.startsWith(srcDir)) continue;
  ts.forEachChild(src, (n) => visit(n, 'Global'));
}

// Sort: variables first, then functions, alphabetical within each.
out.sort((a, b) => {
  if (a.kind !== b.kind) return a.kind === 'Variable' ? -1 : 1;
  return a.label.localeCompare(b.label);
});

const outPath = path.join(projectRoot, 'src', 'ae-dictionary.generated.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${out.length} entries → ${path.relative(projectRoot, outPath)}`);

// ----------------- helpers -----------------

function walk(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(full));
    else result.push(full);
  }
  return result;
}

function jsdocText(node) {
  const docs = ts.getJSDocCommentsAndTags(node);
  const parts = [];
  for (const d of docs) {
    if (!ts.isJSDoc(d)) continue;
    if (typeof d.comment === 'string') parts.push(d.comment);
    else if (Array.isArray(d.comment)) parts.push(d.comment.map(c => c.text || '').join(''));
  }
  return parts.join('\n').trim();
}

function paramSnippet(params) {
  return params.map((p, i) => `\${${i + 1}:${p.name.getText()}}`).join(', ');
}

function paramSig(params) {
  return params.map(p => {
    const q = p.questionToken ? '?' : '';
    const t = p.type ? p.type.getText().replace(/\s+/g, ' ') : 'any';
    return `${p.name.getText()}${q}: ${t}`;
  }).join(', ');
}

function visit(node, ctx) {
  if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
    const name = node.name?.getText() || ctx;
    node.members?.forEach(m => visit(m, name));
    return;
  }
  if (ts.isModuleDeclaration(node) && node.body) {
    ts.forEachChild(node.body, c => visit(c, node.name.getText()));
    return;
  }

  if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node) || ts.isFunctionDeclaration(node)) {
    const name = node.name?.getText();
    if (!name) return;
    const key = `${ctx}.${name}#fn`;
    if (seen.has(key)) return;
    seen.add(key);
    const params = node.parameters ?? [];
    const ret = node.type ? node.type.getText().replace(/\s+/g, ' ') : 'any';
    out.push({
      label: name,
      kind: 'Function',
      insertText: params.length ? `${name}(${paramSnippet(params)})` : `${name}()`,
      insertTextRules: 'InsertAsSnippet',
      detail: `${ctx}.${name}(${paramSig(params)}) ⇒ ${ret}`,
      documentation: jsdocText(node),
      _source: ctx,
    });
    return;
  }

  if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) {
    const name = node.name?.getText();
    if (!name) return;
    const key = `${ctx}.${name}#var`;
    if (seen.has(key)) return;
    seen.add(key);
    const t = node.type ? node.type.getText().replace(/\s+/g, ' ') : 'any';
    out.push({
      label: name,
      kind: 'Variable',
      insertText: name,
      detail: `${ctx}.${name}: ${t}`,
      documentation: jsdocText(node),
      _source: ctx,
    });
    return;
  }

  ts.forEachChild(node, c => visit(c, ctx));
}
