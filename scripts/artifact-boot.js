// The published page's start-up (docs/CAPACITY.md, "One copy of the sim's code"; put in the page by
// scripts/make-artifact.mjs, which fills in CHUNKS). The page's code is in the page as chunks, in script elements that
// aren't run (id fbchunk-<name>): the sim's code that the page and the race's worker share is one of them, in the page
// once. Each chunk is made a module from a blob URL, its imports of the others pointed at their blob URLs, and the
// page's entry imported. The claude.ai host allows module imports from blob URLs (the owner's probe, 13 Nov 2026,
// Safari 27).
// The race's worker is one classic script with no imports: its chunk and the shared one put together (below), from a
// blob URL, as the worker always started. (A module worker from a blob URL, importing the page's blob URLs, works on the
// host, but Chromium won't start one at all from a page opened as a file, whose origin is opaque.)
// If a module can't be imported from a blob URL (the host's rules changed, or a browser that won't), the page's chunks
// are put together the same way, as one module the page runs inline. Put together, each chunk is a function returning
// its exports and its imports of the others are calls to them: exact as long as no shared module reassigns an export
// (make-artifact refuses `export let`). The race then sails in the page's own thread, as whenever its worker can't start.
// Which way it went: document.documentElement.dataset.simLoad, 'blob' or 'fallback' (scripts/check/smoke.cjs checks it).
const CHUNKS = /*CHUNKS*/ null;
const text = name => document.getElementById(`fbchunk-${name}`).textContent;
const blobUrl = src => URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
const mark = way => { document.documentElement.dataset.simLoad = way; console.info(`folkboat: the sim's code loaded from ${way === 'blob' ? 'blob modules' : 'one inline module (blob modules refused)'}`); };

/** One module of `entry` and every chunk it imports: make-artifact's edits turn each chunk's imports of the others into
 * calls returning their exports, its imports of three.js into takes from one import of it, and its export list into
 * what its function returns. `classic`: a classic script instead, run in an async function (no three.js: make-artifact
 * checks the worker's chunks don't import it), whose failure is thrown where the page's Worker.onerror hears it. */
function together(entry, classic = false) {
  const need = new Set(), add = n => { if (!need.has(n)) { need.add(n); CHUNKS.deps[n].forEach(add); } };
  add(entry);
  const names = CHUNKS.order.filter(n => need.has(n));
  const parts = [names.some(n => CHUNKS.three.includes(n)) ? 'import*as __fbThree from"three";' : '',
    'const __fbDone=new Map(),__fbDefs=new Map();',
    'const __fbReq=n=>{let p=__fbDone.get(n);if(!p){p=__fbDefs.get(n)();__fbDone.set(n,p);}return p;};'];
  for (const name of names) {
    let src = text(name);
    for (const [start, end, put] of CHUNKS.edits[name].slice().sort((a, b) => b[0] - a[0])) {
      if (!/^(import|export)/.test(src.slice(start, end))) throw new Error(`folkboat: chunk ${name} isn't as built (edit at ${start}): the page's text was changed`);
      src = src.slice(0, start) + put + src.slice(end);
    }
    parts.push(`__fbDefs.set(${JSON.stringify(name)},async()=>{${src}\n});`);
  }
  parts.push(`await __fbReq(${JSON.stringify(entry)});`);
  return classic ? `(async()=>{${parts.join('\n')}\n})().catch(e=>setTimeout(()=>{throw e;}));` : parts.join('\n');
}

globalThis.__fbSimWorker = blobUrl(together(CHUNKS.worker, true)); // (src/sim/spawn.ts: refused there too where blob: is)

let blobsLoad = true;
try { await import(blobUrl('export default 1')); } catch (e) { blobsLoad = false; console.warn('folkboat: a module from a blob URL was refused:', e); }

if (blobsLoad) {
  const url = {};
  for (const name of CHUNKS.order) { // (each after the chunks it imports; the worker's is in its own module, above)
    if (name === CHUNKS.worker) continue;
    let src = text(name);
    for (const dep of CHUNKS.deps[name]) src = src.replaceAll(`./fbchunk-${dep}.js`, url[dep]);
    url[name] = blobUrl(src);
  }
  mark('blob');
  await import(url[CHUNKS.entry]);
} else {
  mark('fallback');
  const s = document.createElement('script');
  s.type = 'module'; s.textContent = together(CHUNKS.entry);
  document.body.appendChild(s);
}
