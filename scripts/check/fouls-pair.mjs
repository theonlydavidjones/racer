#!/usr/bin/env node
/**
 * The AI's fouls, paired (Skipper Model and Bay East, 18 Nov 2026): the penalties the AI boats are given in the first
 * five minutes of a race, this working tree against another version, over the same seeds, judged race by race.
 *
 * Why paired, and why fresh: a fleet race is chaotic, so any change to the AI, the rules or the physics sends each race
 * down another path, and one race's count swings by ±1–2 either way. Sixteen races' total read 16 → 31 for a change
 * (#454) that sixty fresh seeds then showed made no difference (+0.02 a race, sign test p 0.71). Counts per seed also
 * move with every change on main, so a stored baseline would measure main's drift: the base is sailed fresh each time.
 *
 *   node scripts/check/fouls-pair.mjs                  against origin/main, seeds 1–30 at 12 and 22 kt (60 pairs)
 *   options: --against <ref>  --seeds <a-b | a,b,...>  --winds <kt,kt>  --margin <fouls a race, 0.5>  --alpha <0.05>
 *            --jobs <processes, default the CPUs less one>
 *
 * It fails when this tree's mean is at least `margin` more fouls a race than the base's AND a one-sided paired sign test
 * (ties dropped) puts p under `alpha`: both fixed before the run. A pass at the margin isn't proof of no change; a fail
 * can be a fluke (one in twenty at alpha 0.05, by design): as with perf.test's rule, a fail is sailed again on fresh
 * seeds (--seeds 31-90) and counts only if it fails again.
 *
 * The race is Skipper Model's start gate (tests/fouls-start.test.ts): Seaweed Soup course 10, seven opponents, the real
 * current for 14 Nov 2026, umpired, the user's boat left in the fleet unsteered, to five minutes after the gun, each
 * World.assignPenalty to a boat other than hers counted. Races are deterministic by seed, so they're spread over
 * processes and the answer is the same whatever the machine's load. The other version's src/ is taken from git as
 * perf-pair does (.cache/perf-pair/<commit>/).
 */
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
export const MARGIN = 0.5, ALPHA = 0.05;

/** Each race's AI penalties, in one tree (`root`). */
async function child(root, races) {
  const { runnerImport } = await import('vite');
  const imp = p => runnerImport(path.join(root, p), { root, configFile: false, logLevel: 'error' }).then(m => m.module);
  const [{ World }, { DEFAULT_SETTINGS }, c] = await Promise.all([imp('src/sim/world.ts'), imp('src/settings.ts'), imp('src/courses/data/seaweed-soup-2026-course10.json')]);
  const opponents = ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5', 'gen:1', 'gen:2'];
  const out = [];
  for (const { seed, kt } of races) {
    const w = new World(c.default ?? c, { ...DEFAULT_SETTINGS, judging: 'umpired', tideDate: '2026-11-14', windKind: 'west', windKt: kt, current: 'real', opponents, fleet: 7 }, seed);
    let fouls = 0; const ap = w.assignPenalty.bind(w);
    w.assignPenalty = b => { if (!b.isUser) fouls++; ap(b); };
    while (w.t < 300) w.step(1 / 60);
    out.push(fouls);
  }
  return out;
}

/** Races spread over `jobs` processes, each process one tree: the counts, in `races`' order. */
async function sail(root, races, jobs) {
  const counts = new Array(races.length), parts = Array.from({ length: Math.min(jobs, races.length) }, () => []);
  races.forEach((r, i) => parts[i % parts.length].push(i));
  await Promise.all(parts.map(idx => new Promise((ok, fail) => {
    const p = spawn(process.execPath, [fileURLToPath(import.meta.url), '--child', root, JSON.stringify(idx.map(i => races[i]))], { cwd: ROOT });
    let so = '', se = ''; p.stdout.on('data', d => { so += d; }); p.stderr.on('data', d => { se += d; });
    p.on('close', code => {
      const line = so.split('\n').find(l => l.startsWith('FOULS '));
      if (code !== 0 || !line) return fail(new Error(`fouls-pair: a run failed (exit ${code})\n${se.split('\n').slice(-20).join('\n')}`));
      JSON.parse(line.slice(6)).forEach((n, k) => { counts[idx[k]] = n; }); ok();
    });
  })));
  return counts;
}

/** One-sided sign test: the chance of at least `up` of `n` untied pairs going up if up and down were equally likely. */
export function signP(up, n) {
  let p = 0; // (in logs: n is a few hundred at most, and the binomial's terms underflow long before its sum matters)
  const lf = k => { let s = 0; for (let i = 2; i <= k; i++) s += Math.log(i); return s; };
  for (let k = up; k <= n; k++) p += Math.exp(lf(n) - lf(k) - lf(n - k) - n * Math.LN2);
  return Math.min(1, p);
}

const seedList = s => s.includes('-') && !s.includes(',') ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))(s.split('-').map(Number)) : s.split(',').map(Number);
const args = process.argv.slice(2);
if (args[0] === '--child') {
  console.log('FOULS ' + JSON.stringify(await child(args[1], JSON.parse(args[2]))));
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const ref = opt('--against') ?? 'origin/main', margin = +(opt('--margin') ?? MARGIN), alpha = +(opt('--alpha') ?? ALPHA);
  const seeds = seedList(opt('--seeds') ?? '1-30'), winds = (opt('--winds') ?? '12,22').split(',').map(Number);
  const jobs = +(opt('--jobs') ?? Math.max(1, availableParallelism() - 1));
  const races = winds.flatMap(kt => seeds.map(seed => ({ seed, kt })));
  // (perf-pair's treeOf, imported here only: perf-pair reads `--child` from the command line too, and a child of this
  // script importing it would run perf-pair's own child)
  const { treeOf } = await import('./perf-pair.mjs');
  const t0 = Date.now(), other = treeOf(ref);
  // (one tree at a time, so each has the machine to itself; the counts don't depend on it, only the minutes)
  const here = await sail(ROOT, races, jobs), there = await sail(other.dir, races, jobs);
  const d = here.map((h, i) => h - there[i]), up = d.filter(x => x > 0).length, down = d.filter(x => x < 0).length;
  const mean = d.reduce((a, b) => a + b, 0) / d.length, p = signP(up, up + down);
  for (const kt of winds) {
    const k = races.map((r, i) => r.kt === kt ? i : -1).filter(i => i >= 0), sum = a => k.reduce((s, i) => s + a[i], 0);
    console.log(`  ${kt} kt, seeds ${seeds[0]}–${seeds[seeds.length - 1]}: this tree ${sum(here)} fouls, ${ref} ${sum(there)} (${k.map(i => d[i] > 0 ? '+' : d[i] < 0 ? '-' : '0').join('')})`);
  }
  console.log(`fouls-pair: this tree − ${ref} (${other.sha.slice(0, 8)}) = ${mean >= 0 ? '+' : ''}${mean.toFixed(2)} fouls a race over ${d.length} races; up ${up}, down ${down}, tied ${d.length - up - down}; one-sided sign test p ${p.toFixed(3)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (mean >= margin && p < alpha) {
    console.error(`fouls-pair: FAILED: ${mean.toFixed(2)} more AI fouls a race than ${ref} (margin ${margin}), p ${p.toFixed(3)} < ${alpha}. Sail it again on fresh seeds (--seeds 31-90): it counts only if that fails too.`);
    process.exit(1);
  }
  console.log('fouls-pair: ok');
}
