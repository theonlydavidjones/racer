// The race pool: the slow tests' whole races (tests/helpers/races.ts) sailed side by side on worker threads, one per core
// but one (the test runner's own workers share the rest), instead of one after another in the test's process. The
// races are the same functions of the same seeds, so their answers are the same to the last digit (tests/racepool.test.ts
// checks the pool against the test's own process every run), and each test asserts on all of them as before.
// With two cores or fewer, or no worker threads, they're sailed here in the test's process: slower, the same answers.
// A thread that fails fails the test: there's no falling back once a pool has started.
import * as races from './races';

type Races = typeof races;
type Fn = { [K in keyof Races]: Races[K] extends (...a: never[]) => unknown ? K : never }[keyof Races];

// (Node's modules, typed here: the project doesn't take Node's type definitions)
interface NodeWorker { postMessage(m: unknown): void; on(ev: string, f: (x: never) => void): void; terminate(): Promise<number> }
type WorkerCtor = new (url: URL, o: { workerData: unknown }) => NodeWorker;
const nodeModule = async <T>(name: string): Promise<T | null> => { try { return await import(/* @vite-ignore */ name) as T; } catch { return null; } };

/** Threads to use: one per core but one, or none (then in the test's process): none with two cores or fewer, or no threads. */
export async function poolSize(): Promise<number> {
  const os = await nodeModule<{ availableParallelism?(): number; cpus(): unknown[] }>('node:os');
  const threads = await nodeModule<{ Worker?: WorkerCtor }>('node:worker_threads');
  if (!os || !threads?.Worker) return 0;
  const n = (os.availableParallelism?.() ?? os.cpus().length) - 1;
  return n >= 2 ? n : 0;
}

/** Sail `fn` once for each argument list, in the pool (or here); the results in the same order as `jobs`. */
export async function sail<F extends Fn>(fn: F, jobs: Parameters<Races[F]>[]): Promise<ReturnType<Races[F]>[]> {
  const call = races[fn] as unknown as (...a: unknown[]) => ReturnType<Races[F]>;
  const n = Math.min(await poolSize(), jobs.length);
  if (n < 2) return jobs.map(a => call(...a));
  const { Worker } = (await nodeModule<{ Worker: WorkerCtor }>('node:worker_threads'))!;
  const here = new URL('.', import.meta.url), root = new URL('../../', here);
  const out: ReturnType<Races[F]>[] = new Array(jobs.length);
  let next = 0, done = 0;
  const workers: NodeWorker[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      for (let k = 0; k < n; k++) {
        const wk = new Worker(new URL('raceThread.mjs', here), { workerData: { module: new URL('races.ts', here).pathname, root: root.pathname } });
        workers.push(wk);
        const give = () => { if (next < jobs.length) { const id = next++; wk.postMessage({ id, fn, args: jobs[id] }); } };
        wk.on('message', (m: { ready?: true; id: number; ok: boolean; value?: ReturnType<Races[F]>; error?: string }) => {
          if (m.ready) { give(); return; }
          if (!m.ok) { reject(new Error(`race pool: ${fn}(${JSON.stringify(jobs[m.id])}) failed on its thread: ${m.error}`)); return; }
          out[m.id] = m.value!; done++;
          if (done === jobs.length) resolve(); else give();
        });
        wk.on('error', (e: Error) => reject(new Error(`race pool: a thread stopped: ${e.message}`)));
        wk.on('exit', (code: number) => { if (done < jobs.length && code !== 0) reject(new Error(`race pool: a thread exited (${code}) with races unsailed`)); });
      }
    });
  } finally { await Promise.all(workers.map(w => w.terminate())); }
  return out;
}
