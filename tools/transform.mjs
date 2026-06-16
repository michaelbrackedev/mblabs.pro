// Build-time transform: Claude Design prototype (x-dc) -> clean, CSP-safe static markup.
//
// The design medium is an HTML/CSS/JS prototype using a bespoke `x-dc` React runtime
// ({{ tokens }}, inline `style-hover`/`style-focus`, `onClick`/`onSubmit`, `--mb`/`--mbx` markers).
// We reproduce the VISUAL OUTPUT in a modern, secure static site:
//   - {{ textToken }}        -> <span data-i18n="token">EN value</span>  (toggle swaps to NL)
//   - style-hover / -focus   -> data-hover / data-focus  (engine applies on hover/focus; no inline JS)
//   - onClick={{toggleLang}} -> data-mb-toggle ; onSubmit={{submitForm}} -> data-mb-form
//   - --mb / --mbx markers   -> kept verbatim; engine.ts drives them
// Source stays immutable in the vault; this only generates build artifacts.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, 'design/MBLabs.dc.html');
const OUT_DIR = resolve(__dirname, '../src/generated');

let html = readFileSync(SRC, 'utf8');

// ---- 1. extract EN / NL dictionaries from renderVals() -------------------------------
function extractObj(name) {
  const start = html.indexOf(`const ${name} = {`);
  if (start < 0) throw new Error(`dict ${name} not found`);
  const braceStart = html.indexOf('{', start);
  let depth = 0, i = braceStart;
  for (; i < html.length; i++) {
    const c = html[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  const objText = html.slice(braceStart, i);
  // trusted local design file; literal object of strings only
  // eslint-disable-next-line no-eval
  return (0, eval)('(' + objText + ')');
}
const EN = extractObj('EN');
const NL = extractObj('NL');

// ---- 2. isolate the root markup (drop <helmet> + the data-dc <script>) ----------------
let body = html.slice(html.indexOf('<x-dc>') + '<x-dc>'.length, html.indexOf('</x-dc>'));
body = body.replace(/<helmet>[\s\S]*?<\/helmet>/, '').trim();

// ---- 3. neutralise x-dc-isms ----------------------------------------------------------
// root div: give it an id, drop the {{ accent }} token (accent comes from CSS var / engine).
// Single regex so the id always lands even after the token is stripped.
body = body.replace(/<div style="--mb-accent:\s*\{\{ accent \}\};\s*/, '<div id="mb-root" style="');
if (!/<div id="mb-root"/.test(body)) throw new Error('root div id injection failed');

// handlers -> data hooks (no inline JS, so a strict CSP can forbid 'unsafe-inline' scripts)
body = body.replace(/onClick="\{\{ toggleLang \}\}"/g, 'data-mb-toggle type="button" aria-label="Toggle language"');
body = body.replace(/onSubmit="\{\{ submitForm \}\}"/g, 'data-mb-form');

// hover / focus inline pseudo-styles -> data-* (engine applies them on the real events)
body = body.replace(/style-hover="/g, 'data-hover="');
body = body.replace(/style-focus="/g, 'data-focus="');

// ---- 4. text tokens -> i18n spans -----------------------------------------------------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const missing = new Set();
body = body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
  if (!(key in EN)) { missing.add(key); return ''; }
  return `<span data-i18n="${key}">${esc(EN[key])}</span>`;
});

if (missing.size) console.warn('[transform] unresolved tokens:', [...missing].join(', '));
const left = body.match(/\{\{[^}]*\}\}/g);
if (left) throw new Error('leftover tokens: ' + left.join(', '));

// ---- 5. emit -------------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'body.html'), body, 'utf8');
writeFileSync(resolve(OUT_DIR, 'i18n.json'), JSON.stringify({ en: EN, nl: NL }, null, 2), 'utf8');
console.log(`[transform] body.html (${(body.length / 1024).toFixed(1)}kb) + i18n.json (${Object.keys(EN).length} keys) written`);
