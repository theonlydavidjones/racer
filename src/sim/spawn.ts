/**
 * Starting the race's worker (sim/worker.ts; docs/CAPACITY.md, step 3). In the published page the worker's code is in
 * the page itself, in a script element that isn't run (scripts/make-artifact.mjs puts it there), and the worker starts
 * from a blob URL of it: the claude.ai artifact host allows that (the owner's probe, 13 Nov 2026: Safari 27 started
 * blob workers, classic and module; it refused data: URLs). On the dev server, Vite serves the worker as a module.
 * Null where a worker can't start: the race then sails in the page's own thread, as it always has.
 */
export function spawnSimWorker(): Worker | null {
  try {
    if (typeof Worker === 'undefined') return null;
    const src = document.getElementById('sim-worker')?.textContent;
    if (src) return new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    if (import.meta.env.DEV) return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    return null;
  } catch (e) {
    console.warn('The race\'s worker couldn\'t start; it sails in the page instead:', e);
    return null;
  }
}
