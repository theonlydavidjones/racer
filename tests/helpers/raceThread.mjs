// One thread of the race pool (tests/helpers/racePool.ts): loads tests/helpers/races.ts through Vite's own module runner
// (the installed vite's runnerImport: the same TypeScript, the same transforms as the tests'), then sails the races it's
// sent, one at a time, and sends back what each returned.
import { parentPort, workerData } from 'node:worker_threads';
import { runnerImport } from 'vite';

const { module: races } = await runnerImport(workerData.module, { root: workerData.root, configFile: false, logLevel: 'error' });
parentPort.on('message', ({ id, fn, args }) => {
  try { parentPort.postMessage({ id, ok: true, value: races[fn](...args) }); }
  catch (e) { parentPort.postMessage({ id, ok: false, error: e instanceof Error ? `${e.message}\n${e.stack}` : String(e) }); }
});
parentPort.postMessage({ ready: true });
