// The features tray, drawn over the real page (a mock-up: nothing here is built). node mock.cjs <out> <url>
// Stills: 1-closed (the Show button in the top bar), 2-open (the tray), 3-tile-on (wind in the air lit, and on in the scene).
const { chromium } = require('playwright');
const I = { // 20×20 line icons, as the top bar's
  wind: '<path d="M3 7h9a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3 11h12a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3 15h6"/>',
  flow: '<path d="M4 4c5 1 8 5 9 12"/><path d="M8 3c4 2 6 6 7 12"/><path d="M3 9c3 1 5 3 6 7"/>',
  pos: '<circle cx="10" cy="10" r="7"/><path d="M10 3v3M10 14v3M3 10h3M14 10h3"/><path d="M10 10l3-5"/>',
  band: '<path d="M5 3v14M10 3v14M15 3v14"/><path d="M3.5 7h3M8.5 12h3M13.5 9h3"/>',
  chart: '<path d="M3 5l4-2 6 2 4-2v12l-4 2-6-2-4 2Z"/><path d="M7 3v12M13 5v12"/>',
  inst: '<rect x="3" y="5" width="14" height="10" rx="2"/><path d="M7 12l2-4 2 3 2-2"/>',
  lights: '<path d="M7 15h6"/><path d="M8 17h4"/><path d="M10 3a5 5 0 0 0-3 9v1h6v-1a5 5 0 0 0-3-9Z"/>',
  paddle: '<path d="M4 16 13 7"/><path d="M12 4l4 4-3 3-4-4Z"/>',
  hail: '<path d="M4 5h12v8H9l-4 3v-3H4Z"/>',
  log: '<path d="M6 5h10M6 10h10M6 15h10"/><path d="M3 5h.5M3 10h.5M3 15h.5"/>',
  perf: '<path d="M4 16V9M8 16V5M12 16v-8M16 16v-5"/>',
  speed: '<path d="M3 5l6 5-6 5Z"/><path d="M10 5l6 5-6 5Z"/>',
  show: '<rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="11" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="11" width="6" height="6" rx="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5"/>',
};
const TILES = [
  ['wind', 'Wind in the air', '`'], ['flow', 'Flow over the sails', '\\'], ['pos', 'Points of sail', 'F8'], ['band', 'Sail band', '4'],
  ['chart', 'Course chart', 'M'], ['inst', 'Cabin-top instrument', '6'], ['lights', 'Nav lights', '5'], ['paddle', 'Paddle', '/'],
  ['hail', 'Hail', 'H'], ['log', 'Log', 'L'], ['perf', 'Frame readout', 'F9'],
];
const CSS = `
#bShow svg{width:18px;height:18px}
#bShow.on{opacity:1;color:var(--accent);border-color:var(--accent)}
#featTray{position:fixed;top:64px;right:16px;z-index:60;width:452px;padding:12px;border-radius:12px;background:rgba(9,18,28,.94);
  border:1px solid rgba(255,255,255,.12);box-shadow:0 18px 40px rgba(0,0,0,.45);display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
#featTray .t{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 4px 10px;border-radius:9px;
  border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);color:#cfdbe6;font:600 11px/1.15 var(--f-body);text-align:center}
#featTray .t svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
#featTray .t kbd{position:absolute;top:5px;right:6px;font:600 9.5px/1 var(--f-inst);color:#8fa2b3;letter-spacing:.04em}
#featTray .t.on{border-color:var(--target,#3ad1c1);color:#e9fbf8;background:rgba(58,209,193,.12)}
#featTray .t.on svg{stroke:var(--target,#3ad1c1)}
#featTray .t.act{border-style:dashed}
#featTray .sp{grid-column:span 4;display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:9px;border:1px solid rgba(255,255,255,.10);color:#cfdbe6;font:600 11px/1 var(--f-body)}
#featTray .sp svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linejoin:round}
#featTray .sp .seg{margin-left:auto;display:flex;gap:4px}
#featTray .sp .seg b{padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.14);font:600 11px/1 var(--f-inst)}
#featTray .sp .seg b.on{border-color:var(--accent);color:var(--accent)}`;
(async () => {
  const [out, url] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(200000);
  await p.goto(url); await p.waitForTimeout(5000);
  await p.evaluate(() => document.querySelector('[data-home="race"]').click()); await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelector('[data-home="create"]').click()); await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(8000);
  await p.evaluate(({ CSS, I, TILES }) => {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const fast = document.getElementById('bFast'); // (the audit moves Speed off the surface: into the tray here)
    const btn = document.createElement('button'); btn.className = 'ib'; btn.id = 'bShow'; btn.type = 'button'; btn.title = 'What you can show on screen';
    btn.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true">${I.show}</svg><span class="w">Show</span>`; fast.replaceWith(btn);
    const tray = document.createElement('div'); tray.id = 'featTray'; tray.hidden = true;
    tray.innerHTML = TILES.map(([k, n, key]) => `<div class="t${k === 'hail' || k === 'paddle' ? ' act' : ''}" data-k="${k}"><kbd>${key}</kbd><svg viewBox="0 0 20 20">${I[k]}</svg>${n}</div>`).join('')
      + `<div class="sp"><svg viewBox="0 0 20 20">${I.speed}</svg>Speed<span class="seg"><b class="on">1×</b><b>2×</b><b>4×</b></span></div>`;
    document.body.appendChild(tray);
  }, { CSS, I, TILES });
  await p.screenshot({ path: `${out}/1-closed.jpg`, quality: 85 });
  await p.evaluate(() => { document.getElementById('featTray').hidden = false; document.getElementById('bShow').classList.add('on'); document.querySelector('#featTray [data-k="band"]').classList.add('on'); });
  await p.screenshot({ path: `${out}/2-open.jpg`, quality: 85 });
  await p.keyboard.press('`'); await p.waitForTimeout(2500); // (wind in the air, on for real)
  await p.evaluate(() => document.querySelector('#featTray [data-k="wind"]').classList.add('on'));
  await p.screenshot({ path: `${out}/3-tile-on.jpg`, quality: 85 });
  await b.close();
})();
