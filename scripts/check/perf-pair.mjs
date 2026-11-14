#!/usr/bin/env node
/**
 * The step's speed, paired (docs/CAPACITY.md §8; the owner's method, 14 Nov 2026): this working tree's sim against
 * another version's, both loaded in one process and sailed in alternating 10-second pieces (A, B, B, A, ...), each timed
 * on this thread's own CPU clock. A shared machine's speed drifts by several per cent within the hour; paired this way
 * the drift lands on both alike, and the ratio holds to about ±1–2% where the old single ratio wandered ±5–6%. Run twice,
 * once with each version loaded first (the second one loaded runs slower: 0.4% to 3%, by how busy the host is), three races each, and averaged.
 *
 *   node scripts/check/perf-pair.mjs                 the PR gate: against origin/main (fetched), fails above 1.015
 *   node scripts/check/perf-pair.mjs --budget        the owner's budget: against v168 (425a5eb), fails above 1.019
 *   node scripts/check/perf-pair.mjs --ai            an AI or rules PR's gate: ten races (seeds 1–5, 12 and 22 kt), once each
 *   options: --against <ref>  --max <ratio>  --races <n per order, default 3: the mean of six ratios, about ±0.65%>
 *            --seeds <a,b,...> [--winds <kt,kt>, default 22]: those races once each, alternating the load order
 *
 * The race is perf.test's: Seaweed Soup course 10, a fleet of eight, west 22 kt, the real current for 14 Nov 2026,
 * seed 3, five minutes. The other version's src/ is taken from git into .cache/perf-pair/<commit>/ (nothing checked out,
 * no worktree), fetched from origin first if this clone hasn't got it. About 6 minutes.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
/** The commit the owner's budget was set on (tests/perf.test.ts; docs/CAPACITY.md §1.1a): 43.1 in thread units is v168 × 1.019. */
export const BUDGET_REF = '425a5eb61e5e95dd2da659a92e424b6da6602ee3', BUDGET_MAX = 1.019, GATE_MAX = 1.015;

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The other version's src/, as a directory the race can load from: its commit hash and path. */
export function treeOf(ref) {
  let sha;
  try { sha = git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`); } catch { sha = ''; }
  if (!sha) {
    // (a ref like origin/main, or a commit this shallow clone hasn't got: fetch it)
    const m = /^origin\/(.+)$/.exec(ref);
    git('fetch', '--quiet', 'origin', m ? m[1] : ref);
    sha = git('rev-parse', '--verify', `${m ? `origin/${m[1]}` : 'FETCH_HEAD'}^{commit}`);
  }
  const dir = path.join(ROOT, '.cache', 'perf-pair', sha.slice(0, 12));
  if (!existsSync(path.join(dir, 'src'))) {
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    const tar = execFileSync('git', ['archive', '--format=tar', sha, 'src'], { cwd: ROOT, maxBuffer: 1 << 30 });
    execFileSync('tar', ['-x', '-C', dir], { input: tar });
    symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
    writeFileSync(path.join(dir, '.from'), `${ref} ${sha}\n`);
  }
  return { sha, dir };
}

/** One process: A and B, both loaded, each race (its seed and wind, kt) sailed by both in alternating pieces. Each race's
 * µs a step, A's and B's. */
async function child(A, B, races) {
  const { runnerImport } = await import('vite');
  const load = async root => {
    const imp = p => runnerImport(path.join(root, p), { root, configFile: false, logLevel: 'error' }).then(m => m.module);
    const [{ World }, { DEFAULT_SETTINGS }, c] = await Promise.all([imp('src/sim/world.ts'), imp('src/settings.ts'), imp('src/courses/data/seaweed-soup-2026-course10.json')]);
    const opponents = ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5', 'gen:1', 'gen:2'];
    return (seed, kt) => new World(c.default ?? c, { ...DEFAULT_SETTINGS, tideDate: '2026-11-14', windKind: 'west', windKt: kt, current: 'real', opponents, fleet: 7 }, seed);
  };
  const cpu = () => { const c = process.threadCpuUsage(); return (c.user + c.system) / 1000; };
  const mkA = await load(A), mkB = await load(B), DT = 1 / 60, out = [];
  for (const { seed, kt } of races) {
    const side = [{ w: mkA(seed, kt), ms: 0, n: 0 }, { w: mkB(seed, kt), ms: 0, n: 0 }];
    for (let k = 0; side.some(s => s.w.t < 300); k++) {
      for (const s of k % 2 ? [side[1], side[0]] : side) {
        if (s.w.t >= 300) continue;
        const c0 = cpu(), end = s.w.t + 10;
        while (s.w.t < end) { s.w.step(DT); s.n++; }
        s.ms += cpu() - c0;
      }
    }
    out.push(side.map(s => s.ms * 1000 / s.n));
  }
  return out;
}

/** The perf race: seed 3, west 22 kt. */
const PERF_RACE = { seed: 3, kt: 22 };
/**
 * This working tree against `ref`, both load orders: the ratio (here / ref, the geometric mean of every race) and the
 * runs. `races`: a number, the perf race that many times in each order; or a list of races (seed, kt), each sailed once,
 * in alternate load orders (an AI or rules change sails the fleet differently from one race to the next, so one race's
 * ratio can be ±3% off the mean: CLAUDE.md, docs/CAPACITY.md §8).
 */
export function measure(ref, races = 3) {
  const other = treeOf(ref), runs = [];
  const list = typeof races === 'number' ? null : races;
  const orders = list ? [[ROOT, other.dir, 0, list.filter((_, i) => i % 2 === 0)], [other.dir, ROOT, 1, list.filter((_, i) => i % 2 === 1)]]
    : [[ROOT, other.dir, 0, Array(races).fill(PERF_RACE)], [other.dir, ROOT, 1, Array(races).fill(PERF_RACE)]];
  for (const [A, B, mine, rs] of orders) {
    if (!rs.length) continue;
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child', A, B, JSON.stringify(rs)], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
    const line = (r.stdout ?? '').split('\n').find(l => l.startsWith('PAIR '));
    if (r.status !== 0 || !line) throw new Error(`perf-pair: a run failed (exit ${r.status})\n${(r.stderr ?? '').split('\n').slice(-20).join('\n')}`);
    JSON.parse(line.slice(5)).forEach(([a, b], i) => runs.push({ here: mine === 0 ? a : b, there: mine === 0 ? b : a, hereFirst: mine === 0, race: rs[i] }));
  }
  const ratio = Math.exp(runs.reduce((s, r) => s + Math.log(r.here / r.there), 0) / runs.length);
  return { ref, sha: other.sha, ratio, runs };
}

const args = process.argv.slice(2);
if (args[0] === '--child') {
  const out = await child(args[1], args[2], JSON.parse(args[3]));
  console.log('PAIR ' + JSON.stringify(out));
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const budget = args.includes('--budget');
  const ref = opt('--against') ?? (budget ? BUDGET_REF : 'origin/main'), max = +(opt('--max') ?? (budget ? BUDGET_MAX : GATE_MAX));
  // (--seeds: every seed at every wind of --winds, once each; --ai: the AI and rules gate's set, seeds 1–5 at 12 and 22 kt)
  const seeds = args.includes('--ai') ? '1,2,3,4,5' : opt('--seeds'), winds = opt('--winds') ?? (args.includes('--ai') ? '12,22' : '22');
  const races = seeds ? winds.split(',').flatMap(kt => seeds.split(',').map(seed => ({ seed: +seed, kt: +kt }))) : +(opt('--races') ?? 3);
  const t0 = Date.now(), m = measure(ref, races);
  for (const r of m.runs) console.log(`  ${r.hereFirst ? 'this tree loaded first ' : `${ref} loaded first`}${typeof races === 'number' ? '' : `, seed ${r.race.seed} ${r.race.kt} kt`}: this tree ${r.here.toFixed(0)} µs a step, ${ref} ${r.there.toFixed(0)}: ${(r.here / r.there).toFixed(4)}`);
  console.log(`perf-pair: this tree / ${ref} (${m.sha.slice(0, 8)}) = ${m.ratio.toFixed(4)}, limit ${max} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (!(m.ratio <= max)) { console.error(`perf-pair: FAILED: the step is ${((m.ratio - 1) * 100).toFixed(1)}% slower than ${ref}, over the ${((max - 1) * 100).toFixed(1)}% allowed`); process.exit(1); }
  console.log('perf-pair: ok');
}
