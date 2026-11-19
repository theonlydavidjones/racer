#!/usr/bin/env node
/**
 * The release gate for the frame's cost (ROADMAP 8x; docs/CAPACITY.md §8): this tree's page against another version's,
 * measured back to back by perf.cjs (its eight views: the renderer's counts and the JS a frame), alternating which goes
 * first, so a stuttering build can't ship unnoticed. Each version is served by its own dev server; the other version's
 * app is taken from git into .cache/perf-ab/<commit>/ (as perf-pair.mjs does the sim's), fetched first if need be.
 *
 *   node scripts/check/perf-ab.cjs --against <ref> [--rounds 2] [out-dir]
 *     before publishing: --against the published version's commit. About 15 minutes for two rounds.
 *     The other version is given this tree's daily weather data (WEATHER, below), so both sail the same day and only the
 *     code differs; --own-weather keeps each version's own. It exits 2 if the two still sailed different races (the course,
 *     the day's wind, the fleet), as their counts can't then be compared.
 *
 * Headless Chromium draws with SwiftShader, a second or two a frame, so frame times and their percentiles mean nothing
 * here (the page's thread waits on the software GPU). What does hold: the renderer's counts, which are the same run to
 * run and the best measure here of what the GPU is asked to do, and the JS a frame, which is noisy (±5 ms) but paired
 * back to back the host's drift lands on both alike. It fails, in any view, on:
 *   - draw calls or triangles up more than 5% (and 30 calls; 20,000 triangles),
 *   - shader programs up more than 5,
 *   - the JS a frame up more than 15% and 3 ms in two views or more, each side's least over the rounds (the host's
 *     contention only ever adds time: one run's outlier, 70 ms where the view takes 36, mustn't fail a clean build;
 *     and one view alone can wobble +20% under load). Run it on a quiet host: a full test suite beside it slows one
 *     side's runs more than the other's,
 *   - the heap after a few races up more than 15 MB,
 *   - the inset map's own JS a frame (its drawing and its overlay) up more than 30% and 0.5 ms, in any view (ROADMAP 8b:
 *     perf.cjs's inset_layers view has the wind field and the wind shadows on).
 * (LIM, below: v186 → v188 fails on its triangles, programs, heap and JS.) The page is drawn at half size, the same shape
 * (PERF_SCALE, 0.5): the software GL's frames come about twice as fast. Its counts are a little under perf.cjs's
 * full-size page's (a few things are drawn by their size on screen), but both versions are drawn the same.
 *
 *   node scripts/check/perf-ab.cjs --compare <out-dir>   the verdict again from a run's saved results
 * The absolute budget (perf.cjs's own: calls, triangles, programs, 30 ms of JS) is reported, not gated here: perf.cjs is
 * its check.
 */
const { execFileSync, spawn } = require('child_process');
const fs = require('fs'), path = require('path'), http = require('http');

const ROOT = path.resolve(__dirname, '../..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const ownWeather = args.includes('--own-weather'); if (ownWeather) args.splice(args.indexOf('--own-weather'), 1);
const WEATHER = ['src/environment/data/sf-real-days.json', 'src/environment/data/sf-rain.json'];
const compare = opt('--compare', null), against = opt('--against', 'origin/main'), rounds = +opt('--rounds', 2), out = compare || args[0] || path.join(ROOT, '.cache', 'perf-ab');
fs.mkdirSync(out, { recursive: true });
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The other version's app (what its dev server serves), as a directory. */
function treeOf(ref) {
  let sha;
  try { sha = git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`); } catch { sha = ''; }
  if (!sha) { const m = /^origin\/(.+)$/.exec(ref); git('fetch', '--quiet', 'origin', m ? m[1] : ref); sha = git('rev-parse', '--verify', `${m ? `origin/${m[1]}` : 'FETCH_HEAD'}^{commit}`); }
  const dir = path.join(ROOT, '.cache', 'perf-ab', sha.slice(0, 12));
  if (!fs.existsSync(path.join(dir, 'index.html'))) {
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const tar = execFileSync('git', ['archive', '--format=tar', sha, 'src', 'index.html', 'vite.config.ts', 'tsconfig.json', 'package.json'], { cwd: ROOT, maxBuffer: 1 << 30 });
    execFileSync('tar', ['-x', '-C', dir], { input: tar });
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
  }
  // The daily real-weather refresh (scripts/fetch-real-days.mjs, fetch-rain.mjs) rewrites these, and perf.cjs's race sails
  // a day from them: a published version a day older sails another wind (v205 against v204, 18 Nov 2026: 160° 21 kt
  // against 170° 22 kt, its course's first leg a run, not a reach, and the fleet elsewhere in every view: triangles +13% in
  // two views with no change to what's drawn). So the other version gets this tree's, and only the code differs.
  // (--own-weather: each its own, as published.)
  // (written every time, either way: the directory is kept between runs)
  for (const f of WEATHER) {
    const dst = path.join(dir, f); if (!fs.existsSync(path.dirname(dst))) continue;
    if (!ownWeather && fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), dst);
    else { try { fs.writeFileSync(dst, execFileSync('git', ['show', `${sha}:${f}`], { cwd: ROOT, maxBuffer: 1 << 28 })); } catch { /* (not in that version) */ } }
  }
  return { sha, dir };
}

/** A dev server for `dir` on `port`, ready. */
async function serve(dir, port) {
  const p = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  const up = () => new Promise(res => http.get(`http://localhost:${port}/`, r => { r.resume(); res(r.statusCode === 200); }).on('error', () => res(false)));
  for (let i = 0; i < 120; i++) { if (await up()) return p; await new Promise(r => setTimeout(r, 500)); }
  p.kill(); throw new Error(`perf-ab: the dev server for ${dir} never came up on :${port}`);
}

/** One perf.cjs run against a server: its rows (per view) and its races' memory. */
function perfRun(port, tag) {
  const json = path.join(out, `perf-ab-${tag}.json`);
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/check/perf.cjs'), path.join(out, tag)], {
      cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 40 * 60 * 1000,
      env: { ...process.env, PERF_URL: `http://localhost:${port}/?inproc`, PERF_JSON: json, PERF_FRAMES: '9', PERF_RACES: '4', PERF_SCALE: process.env.PERF_SCALE || '0.5' },
    });
  } catch (e) { if (!fs.existsSync(json)) throw new Error(`perf-ab: perf.cjs failed against :${port}: ${String(e.stderr || e.message).slice(-400)}`); } // (over perf.cjs's own budget it exits 1: its rows still count)
  return JSON.parse(fs.readFileSync(json, 'utf8'));
}

/**
 * What counts as a clear regression. v186 → v188, the build that stuttered (ROADMAP 8x), measured here: triangles +7–9%
 * in six views, programs +10, the heap +22 MB, the JS a frame +10–25% in most views. The counts come back the same run
 * to run (a few draw calls apart where the race has moved on), so their limits sit well inside that; the JS's noise
 * (±5 ms headless) needs both its median's share and its size.
 */
const LIM = { counts: 1.05, programs: 5, js: 1.15, jsMs: 3, jsViews: 2, heapMB: 15, inset: 1.3, insetMs: 0.5 };
const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2; };

(async () => {
  const runs = { this: [], ref: [] }, t0 = Date.now();
  if (compare) {
    for (const f of fs.readdirSync(out).filter(f => /^perf-ab-(this|ref)-\d+\.json$/.test(f)).sort()) runs[f.split('-')[2]].push(JSON.parse(fs.readFileSync(path.join(out, f), 'utf8')));
    if (!runs.this.length || !runs.ref.length) throw new Error(`perf-ab: no saved runs of both versions in ${out}`);
    console.log(`perf-ab: the saved runs in ${out} (${runs.ref.length} of the reference, ${runs.this.length} of this tree)`);
  } else await measureBoth(runs);
  verdict(runs, t0);
})().catch(e => { console.error(e); process.exit(2); });

async function measureBoth(runs) {
  fs.mkdirSync(path.join(out, 'this'), { recursive: true }); fs.mkdirSync(path.join(out, 'ref'), { recursive: true });
  const ref = treeOf(against), here = git('rev-parse', '--short=8', 'HEAD');
  console.log(`perf-ab: this tree (${here}${git('status', '--porcelain', '--untracked-files=no') ? ', with changes' : ''}) against ${against} (${ref.sha.slice(0, 8)}), ${rounds} rounds${ownWeather ? ', each its own weather data' : ', both on this tree\'s weather data'}`);
  const sA = await serve(ROOT, 5191), sB = await serve(ref.dir, 5192);
  try {
    for (let r = 0; r < rounds; r++) {
      const order = r % 2 ? ['this', 'ref'] : ['ref', 'this']; // (alternating which goes first)
      for (const who of order) { runs[who].push(perfRun(who === 'this' ? 5191 : 5192, `${who}-${r}`)); console.log(`  round ${r + 1}: ${who} measured`); }
    }
  } finally { sA.kill(); sB.kill(); }
}

function verdict(runs, t0) {
  // (both versions must have sailed the same race, or the comparison means nothing: a version that made more objects while
  // the page loaded once shifted perf.cjs's pinned random numbers and sailed another wind and fleet, +20% "regression"; a
  // day's newer weather data did the same, which treeOf now copies across)
  const id = R => R.race ? JSON.stringify(R.race) : null, ids = [...runs.ref, ...runs.this].map(id);
  if (ids.every(Boolean) && new Set(ids).size > 1) {
    console.error(`perf-ab: the two versions sailed different races, so they can't be compared:\n  ${[...new Set(ids)].join('\n  ')}`);
    process.exit(2);
  }
  const views = runs.this[0].rows.map(x => x.view);
  const fails = [], jsOver = [];
  console.log('\nview                 calls (ref → this)     triangles (ref → this)     programs   JS ms/frame, least (ref → this)');
  for (const v of views) {
    const T = runs.this.map(R => R.rows.find(x => x.view === v)), F = runs.ref.map(R => R.rows.find(x => x.view === v));
    if (F.some(x => !x)) continue;
    const c0 = median(F.map(x => x.calls)), c1 = median(T.map(x => x.calls)), t0_ = median(F.map(x => x.tris)), t1 = median(T.map(x => x.tris));
    const p0 = Math.max(...F.map(x => x.programs)), p1 = Math.max(...T.map(x => x.programs)), j0 = Math.min(...F.map(x => x.js)), j1 = Math.min(...T.map(x => x.js));
    const bad = [];
    if (c1 > c0 * LIM.counts && c1 - c0 > 30) bad.push(`draw calls ${c0} → ${c1}`);
    if (t1 > t0_ * LIM.counts && t1 - t0_ > 20000) bad.push(`triangles ${t0_} → ${t1}`);
    if (p1 - p0 > LIM.programs) { bad.push(`programs ${p0} → ${p1}`); if (!fails.some(f => f.startsWith('shader programs'))) fails.push(`shader programs ${p0} → ${p1}`); } // (the page's, not the view's: said once)
    if (j1 > j0 * LIM.js && j1 - j0 > LIM.jsMs) { bad.push(`JS a frame ${j0.toFixed(1)} → ${j1.toFixed(1)} ms`); jsOver.push(`${v} ${j0.toFixed(1)} → ${j1.toFixed(1)} ms`); }
    // the inset map's own JS a frame (perf.cjs's inset column), the least over the rounds: gated in every view, as it's
    // small and steady (the owner's "inset map is really lagging again", 15 Nov 2026)
    const i0 = Math.min(...F.map(x => x.inset ?? NaN)), i1 = Math.min(...T.map(x => x.inset ?? NaN));
    if (Number.isFinite(i0) && Number.isFinite(i1) && i1 > i0 * LIM.inset && i1 - i0 > LIM.insetMs) bad.push(`the inset map's JS ${i0.toFixed(2)} → ${i1.toFixed(2)} ms a frame`);
    for (const b of bad) if (!b.startsWith('programs') && !b.startsWith('JS')) fails.push(`${v}: ${b}`);
    const pct = (a, b) => `${b >= a ? '+' : ''}${((b / a - 1) * 100).toFixed(0)}%`;
    console.log(`${v.padEnd(19)} ${String(c0).padStart(6)} → ${String(c1).padEnd(6)} ${pct(c0, c1).padStart(5)}   ${String(t0_).padStart(8)} → ${String(t1).padEnd(8)} ${pct(t0_, t1).padStart(5)}   ${String(p0).padStart(3)} → ${String(p1).padEnd(3)}   ${j0.toFixed(1).padStart(5)} → ${j1.toFixed(1).padEnd(5)} ${pct(j0, j1).padStart(5)}   inset ${Number.isFinite(i0) ? i0.toFixed(2) : '-'} → ${Number.isFinite(i1) ? i1.toFixed(2) : '-'}${bad.length ? '  REGRESSION' : ''}`);
  }
  // (the JS, only where it's over in two views or more: a real regression moves several (v188's, five or six), and one
  // view's run-to-run wobble under load can reach +20% on its own)
  if (jsOver.length >= LIM.jsViews) fails.push(`the JS a frame in ${jsOver.length} views: ${jsOver.join(', ')}`);
  else if (jsOver.length) console.log(`(the JS a frame over in one view only, ${jsOver[0]}: the noise, not counted)`);
  const heap = who => median(runs[who].map(R => R.races.length ? R.races[R.races.length - 1].heap : NaN));
  const h0 = heap('ref'), h1 = heap('this');
  if (Number.isFinite(h0) && Number.isFinite(h1)) { console.log(`heap after the races: ${h0.toFixed(0)} → ${h1.toFixed(0)} MB`); if (h1 - h0 > LIM.heapMB) fails.push(`heap ${h0.toFixed(0)} → ${h1.toFixed(0)} MB`); }
  const errs = [...runs.this, ...runs.ref].flatMap(R => R.errs); if (errs.length) fails.push(`page errors: ${errs.slice(0, 3).join(' | ')}`);
  console.log(`\nperf-ab (${((Date.now() - t0) / 60000).toFixed(0)} min): ${fails.length ? `FAILED: ${fails.join('; ')}` : 'ok'}`);
  process.exit(fails.length ? 1 : 0);
}
