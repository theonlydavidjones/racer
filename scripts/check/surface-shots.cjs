/**
 * The game surface at 1280×720 and 1920×1080 in a race, a cruise and a lesson: a still of each, with the crew pop, the
 * tools tray and the pilot panel open, and a list of any two visible pieces that overlap (the viewBar's buttons, the
 * helm's, the sail band, the inset, the message log, toasts, the pilot, the pops). Needs the dev server.
 *   node scripts/check/surface-shots.cjs <url> <out-dir>      → exit 1 if any overlap
 */
const { chromium } = require('playwright');
const [url, out] = [process.argv[2] || 'http://localhost:5173/', process.argv[3] || '.'];
const PIECES = ['#helmBar', '#pilot', '#viewBar', '#sailBand', '#map', '#msgLog', '#toast', '#crewPop', '#toolsTray', '#nextCard', '#coachPanel', '#tiller', '#dial', '#hudRight'];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const bad = [], errs = [];
  const run = async (name, size, start) => {
    const p = await b.newPage({ viewport: { width: size[0], height: size[1] } }); p.setDefaultTimeout(180000);
    p.on('pageerror', e => errs.push(`${name}: ${e.message}`));
    await p.goto(url); await p.waitForTimeout(5000);
    await p.evaluate(start); await p.waitForTimeout(9000);
    const tag = `${name}-${size[0]}`;
    const overlaps = async (what) => {
      const r = await p.evaluate(sel => {
        const vis = s => { const e = document.querySelector(s); if (!e || e.hidden) return null; const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden') return null; const q = e.getBoundingClientRect(); return q.width > 2 && q.height > 2 ? q : null; };
        const OVER = ['#crewPop', '#toolsTray'], FINE = ['#helmBar|#pilot', '#hudRight|#toolsTray', '#map|#toolsTray'];
        const boxes = sel.map(s => [s, vis(s)]).filter(x => x[1]), o = [];
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i][1], c = boxes[j][1];
          if (!(OVER.includes(boxes[i][0]) || OVER.includes(boxes[j][0])) || ['#viewBar', '#helmBar', '#tiller', '#pilot'].some(k => k === boxes[i][0] || k === boxes[j][0])) if (!FINE.includes(boxes[i][0] + '|' + boxes[j][0])) if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) o.push(boxes[i][0] + ' × ' + boxes[j][0]); }
        const off = boxes.filter(x => x[1].right > innerWidth + 1 || x[1].bottom > innerHeight + 1).map(x => x[0] + ' off-screen');
        return [...o, ...off];
      }, PIECES);
      if (r.length) { console.log(`${tag} ${what}: OVERLAP ${r.join(', ')}`); bad.push(`${tag} ${what}`); } else console.log(`${tag} ${what}: clear`);
    };
    await p.screenshot({ path: `${out}/${tag}.png` }); await overlaps('base');
    for (const [id, what] of [['bCrew', 'crew'], ['bTools', 'tools'], ['bPilot', 'pilot']]) {
      const ok = await p.evaluate(i => { const e = document.getElementById(i); if (!e || e.hidden) return false; e.click(); return true; }, id);
      if (!ok) { console.log(`${tag} ${what}: button not shown`); continue; }
      await p.waitForTimeout(1200); await p.screenshot({ path: `${out}/${tag}-${what}.png` }); await overlaps(what);
      if (id !== 'bPilot') await p.evaluate(i => document.getElementById(i).click(), id);
    }
    await p.close();
  };
  const race = () => { document.querySelector('[data-home="race"]').click(); setTimeout(() => document.querySelector('[data-home="create"]')?.click(), 1000); setTimeout(() => document.getElementById('bGo')?.click(), 3000); };
  const cruise = () => { document.querySelector('[data-home="cruise"]').click(); setTimeout(() => document.getElementById('bGo')?.click(), 2500); };
  const lesson = () => { document.getElementById('bLessons').click(); setTimeout(() => document.querySelector('#lessonGrid [data-lesson="tiller"]')?.click(), 1500); };
  const only = process.argv[4]; // (optional: one mode, e.g. `cruise`, for a quicker look)
  for (const size of [[1280, 720], [1920, 1080]]) for (const [n, f] of [['race', race], ['cruise', cruise], ['lesson', lesson]]) if (!only || only === n) await run(n, size, f);
  console.log('ERRORS:', errs.join(' | ') || 'none');
  await b.close(); process.exit(errs.length || bad.length ? 1 : 0);
})();
