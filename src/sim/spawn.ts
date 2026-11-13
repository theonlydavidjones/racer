/**
 * Starting the race's worker (sim/worker.ts; docs/CAPACITY.md, step 3). In the published page the worker's code is a
 * classic script from a blob URL that the page's start-up script made (scripts/artifact-boot.js): the worker's own chunk
 * and the sim's code the page shares with it, put together (docs/CAPACITY.md, "One copy of the sim's code"). The claude.ai
 * artifact host allows that (the owner's probes, 13 Nov 2026: Safari 27 started blob workers, classic and module, and
 * imported modules from blob URLs; it refused data: URLs). On the dev server, Vite serves the worker as a module.
 * Null where a worker can't start: the race then sails in the page's own thread, as it always has.
 */
export function spawnSimWorker(): Worker | null {
  try {
    if (typeof Worker === 'undefined') return null;
    const url = (globalThis as { __fbSimWorker?: string }).__fbSimWorker;
    if (url) return new Worker(url);
    if (import.meta.env.DEV) return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    return null;
  } catch (e) {
    console.warn('The race\'s worker couldn\'t start; it sails in the page instead:', e);
    return null;
  }
}
