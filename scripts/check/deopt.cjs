#!/usr/bin/env node
// The engine's optimizing compiler, in the first race after load (docs/CAPACITY.md, "The compiler's thrown-away
// work"): the perf test's race, cold, under node --trace-opt, counting the compiles thrown away ("aborted optimizing")
// function by function. A handful is normal. Hundreds for one function means it's recompiled and discarded all race
// long, on the browser's compiler threads: on 13 Nov 2026, checkPairs 629 times and assessPair 196 (14 s), after boat
// fields that had only held whole numbers got their first fractions mid-race and the boats' hidden classes changed
// under the rules' feedback (world.ts asDoubles). The sim's own thread doesn't show it, so neither the perf test nor a
// profile of the step does.
//
//   node scripts/check/deopt.cjs [max per function, default 20]
//
// Fails (exit 1) when any function's aborted compiles exceed the limit, or the race doesn't finish.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const MAX = Number(process.argv[2] ?? 20);
const race = path.join(__dirname, 'deopt-race.mjs');
const t0 = Date.now();
const r = spawnSync(process.execPath, ['--trace-opt', race], { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
const out = (r.stdout ?? '') + (r.stderr ?? '');
if (r.status !== 0 || !/DEOPT-RACE done/.test(out)) {
  console.error(`deopt: the race didn't finish (exit ${r.status})\n${out.split('\n').filter(l => !l.startsWith('[')).slice(-30).join('\n')}`);
  process.exit(1);
}
const by = new Map(), why = new Map();
for (const line of out.split('\n')) {
  const m = /^\[aborted optimizing .*?<JSFunction (\S*) .*?because: (.*?) - took/.exec(line);
  if (!m) continue;
  const f = !m[1] || m[1].startsWith('(') ? '(anonymous)' : m[1];
  by.set(f, (by.get(f) ?? 0) + 1);
  why.set(f, m[2]);
}
const rows = [...by].sort((a, b) => b[1] - a[1]);
const total = rows.reduce((s, [, n]) => s + n, 0);
console.log(`deopt: ${total} aborted compiles in the cold race (${((Date.now() - t0) / 1000).toFixed(0)} s); the most:`);
for (const [f, n] of rows.slice(0, 8)) console.log(`  ${String(n).padStart(4)}  ${f}  (${why.get(f)})`);
const over = rows.filter(([, n]) => n > MAX);
if (over.length) {
  console.error(`deopt: FAILED: ${over.map(([f, n]) => `${f} ${n}×`).join(', ')} (more than ${MAX} for one function). Look for a field that`
    + ` changes kind mid-race (a whole number that later holds a fraction, a number that later holds an object): node --trace-generalization.`);
  process.exit(1);
}
console.log(`deopt: ok (no function over ${MAX})`);
