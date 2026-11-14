#!/usr/bin/env node
/**
 * Assemble the playable single-page build for the claude.ai artifact:
 *   npm run build:artifact   →   artifact/folkboat-racing-sim.html
 * Takes the markup from index.html, inlines the built CSS, and puts in the page's code as the chunks vite.artifact.config.ts
 * builds: the page and the race's worker share the sim's code, one chunk, in the page once (docs/CAPACITY.md, "One copy
 * of the sim's code"). Each chunk goes in a script element that isn't run; the start-up script (scripts/artifact-boot.js)
 * makes them modules from blob URLs. three.js is mapped to jsDelivr (pinned to the version in package.json) with an
 * import map.
 *
 * Checked here, failing the build otherwise:
 * - each chunk's imports, static and dynamic, are what the bundler's manifest says, and each chunk's name appears in
 *   the code only at those imports (the start-up script swaps the names for blob URLs);
 * - the forms the start-up script's fallback rewrites: imports first, the one export list last, nothing else;
 * - no module in src/ exports a binding it could reassign (`export let`, `export var`, a local `export { }`): the
 *   fallback hands on each chunk's exports as they are when it has run;
 * - nothing in a chunk that the HTML parser would change or end early.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseAst } from 'rolldown/parseAst';
import { reassignableExports } from './export-guard.mjs';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const threeVersion = JSON.parse(await readFile(new URL('node_modules/three/package.json', root), 'utf8')).version;
const dist = new URL('dist-artifact/', root);
const fail = msg => { throw new Error(`make-artifact: ${msg}`); };

// the chunks, from the bundler's manifest
const manifest = JSON.parse(await readFile(new URL('.vite/manifest.json', dist), 'utf8').catch(() => fail('run `vite build -c vite.artifact.config.ts` first')));
const nameOf = file => /^fbchunk-([\w-]+)\.js$/.exec(file)?.[1] ?? fail(`unexpected chunk ${file}`);
const chunks = new Map(); // name → { file, deps (static), dyn (dynamic) }
for (const e of Object.values(manifest)) {
  if (!e.file.endsWith('.js')) continue;
  chunks.set(nameOf(e.file), { file: e.file, entry: !!e.isEntry, deps: (e.imports ?? []).map(k => nameOf(manifest[k].file)), dyn: (e.dynamicImports ?? []).map(k => nameOf(manifest[k].file)) });
}
const entry = 'main', worker = 'worker';
if (!chunks.has(entry) || !chunks.has(worker)) fail('expected the entries main and worker');
const cssFile = Object.values(manifest).find(e => e.file.endsWith('.css'))?.file ?? fail('no CSS');

// a binding a module could reassign, exported: the fallback couldn't hand it on live
// (scripts/export-guard.mjs; tests/exports.test.ts checks the same before a merge)
for (const e of await reassignableExports(root)) fail(`${e} exports a binding that could be reassigned: export a const, a function or a class`);

const edits = {}, texts = {}, three = [];
for (const [name, c] of chunks) {
  const t = await readFile(new URL(c.file, dist), 'utf8');
  if (/<\/script|<!--|\r|\0/i.test(t)) fail(`${c.file} has text the HTML parser would change or end the script at`);
  const ast = parseAst(t), ed = [], sites = new Map(), seenDyn = [];
  const target = src => { const m = /^\.\/fbchunk-([\w-]+)\.js$/.exec(src); return m ? m[1] : null; };
  const count = n => sites.set(n, (sites.get(n) ?? 0) + 1);
  let body = false;
  ast.body.forEach((s, i) => {
    if (s.type === 'ImportDeclaration') {
      if (body) fail(`${c.file}: an import after other code`);
      const src = s.source.value, dep = target(src);
      const named = s.specifiers.filter(p => p.type !== 'ImportNamespaceSpecifier').map(p => `${JSON.stringify(p.type === 'ImportDefaultSpecifier' ? 'default' : p.imported.name ?? p.imported.value)}:${p.local.name}`);
      const ns = s.specifiers.find(p => p.type === 'ImportNamespaceSpecifier')?.local.name;
      const pull = from => (ns ? `const ${ns}=${from};` : '') + (named.length ? `const{${named.join(',')}}=${ns ?? from};` : '');
      if (dep) { if (!c.deps.includes(dep)) fail(`${c.file} imports ${src}, which the manifest doesn't list`); count(dep); ed.push([s.start, s.end, (ns || named.length) ? pull(`await __fbReq(${JSON.stringify(dep)})`) : `await __fbReq(${JSON.stringify(dep)});`]); }
      else if (src === 'three') { ed.push([s.start, s.end, pull('__fbThree')]); if (!three.includes(name)) three.push(name); }
      else fail(`${c.file} imports ${src}`);
    } else if (s.type === 'ExportNamedDeclaration') {
      if (s.source || s.declaration || i !== ast.body.length - 1) fail(`${c.file}: an export the fallback can't rewrite (it takes one export list, last)`);
      ed.push([s.start, s.end, `return{${s.specifiers.map(p => `${JSON.stringify(p.exported.name ?? p.exported.value)}:${p.local.name}`).join(',')}};`]);
    } else if (/^Export/.test(s.type)) fail(`${c.file}: ${s.type}`);
    else body = true;
  });
  // dynamic imports, anywhere: a constant path to another chunk
  const walk = n => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'ImportExpression') {
      const s = n.source, src = s.type === 'Literal' ? s.value : s.type === 'TemplateLiteral' && !s.expressions.length ? s.quasis[0].value.cooked : null, dep = src && target(src);
      if (!dep || !c.dyn.includes(dep)) fail(`${c.file}: import(${t.slice(s.start, s.end)}) isn't one the manifest lists`);
      count(dep); seenDyn.push(dep); ed.push([n.start, n.end, `__fbReq(${JSON.stringify(dep)})`]);
    }
    for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); }
  };
  walk(ast);
  for (const d of c.deps) if (!sites.has(d)) fail(`${c.file}: the manifest lists ${d}, not imported`);
  for (const d of c.dyn) if (!seenDyn.includes(d)) fail(`${c.file}: the manifest lists import(${d}), not found`);
  // each chunk's name only where it's imported: the start-up script swaps every one for a blob URL
  for (const other of chunks.keys()) {
    const n = t.split(`./fbchunk-${other}.js`).length - 1;
    if (n !== (sites.get(other) ?? 0)) fail(`${c.file} names fbchunk-${other}.js ${n} times, imports it ${sites.get(other) ?? 0}`);
  }
  if (/fbchunk-/.test(t.replaceAll(/\.\/fbchunk-[\w-]+\.js/g, ''))) fail(`${c.file} names a chunk outside an import`);
  // (the edits as the start-up script will splice them: check they cover just what they should)
  for (const [a, b] of ed) if (!/^(import|export)/.test(t.slice(a, b))) fail(`${c.file}: an edit at ${a} doesn't start at an import or export (offsets?)`);
  edits[name] = ed; texts[name] = t;
}

// the race's worker: one module of its chunk and those it imports (artifact-boot.js), and a worker has no import map
{ const need = new Set(), add = n => { if (!need.has(n)) { need.add(n); const c = chunks.get(n); [...c.deps, ...c.dyn].forEach(add); } }; add(worker);
  const t3 = [...need].filter(n => three.includes(n)); if (t3.length) fail(`the worker's code imports three.js (${t3.join(', ')})`); }

// the order: each chunk after those it imports, statically or dynamically (none import each other in a ring)
const order = [], state = new Map();
const visit = (n, path) => {
  if (state.get(n) === 'done') return; if (state.get(n) === 'on') fail(`the chunks import each other in a ring: ${[...path, n].join(' → ')}`);
  state.set(n, 'on'); const c = chunks.get(n); for (const d of [...c.deps, ...c.dyn]) visit(d, [...path, n]); state.set(n, 'done'); order.push(n);
};
for (const n of chunks.keys()) visit(n, []);

const boot = (await readFile(new URL('scripts/artifact-boot.js', root), 'utf8'))
  .replace('/*CHUNKS*/ null', JSON.stringify({ order, entry, worker, three, deps: Object.fromEntries([...chunks].map(([n, c]) => [n, [...c.deps, ...c.dyn]])), edits }));
if (/<\/script/i.test(boot)) fail('the start-up script contains </script');

const style = await readFile(new URL(cssFile, dist), 'utf8');
const html = await readFile(new URL('index.html', root), 'utf8');
const head = html.slice(html.indexOf('<title>'), html.indexOf('</head>')).trim();
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"')).trim();

// (the charset first: the chunks hold non-ASCII text, and the fallback's edits are by position in it. The claude.ai host
// declares it in the document it wraps the page in; a plain file load needs it here)
const out = `<meta charset="utf-8">
${head}
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${style}
</style>
${body}
${order.map(n => `<script type="text/plain" id="fbchunk-${n}">${texts[n]}</script>`).join('\n')}
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@${threeVersion}/build/three.module.js"}}</script>
<script type="module">
${boot}
</script>
`;
await mkdir(new URL('artifact/', root), { recursive: true });
await writeFile(new URL('artifact/folkboat-racing-sim.html', root), out);
const kb = s => `${(s.length / 1024).toFixed(0)} KB`;
console.log(`artifact/folkboat-racing-sim.html: ${kb(out)}: ${order.map(n => `${n} ${kb(texts[n])}`).join(', ')}; three@${threeVersion} from jsDelivr, sim v${pkg.version}`);
