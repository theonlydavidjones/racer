#!/usr/bin/env node
/**
 * MOCK-UP ONLY (not the sim's code): a Windy-style treatment of the chart's wind and current layers, drawn over the
 * real full-screen chart with the sim's own fields (World.windHere, World.currentAt), for the owner to say yes or no to.
 * Needs the dev server on :5173.
 *
 *   node proposals/windy-mockup.cjs proposals   → proposals/windy-wind.png, proposals/windy-current.png
 */
const { chromium } = require('playwright');
const out = process.argv[2] || 'proposals';
// the times of day: the afternoon sea breeze, and the day's strongest ebb through the Gate (NOAA's predictions for
// 2026-11-14: Golden Gate Bridge SFB1202 and the Bay Entrance SFB1201, 2.5–2.8 kt about 02:30Z, 18:30 local)
const WIND_T = process.env.WIND_T || '15:00', CUR_T = process.env.CUR_T || '18:30';

// what's drawn over the chart, in the page (sim metres: x east, y north; the chart is north up)
function overlay(kind) {
  const w = sim(), c = document.getElementById('chartC'), r = c.getBoundingClientRect();
  const scale = Math.min(innerWidth, innerHeight) / 6000 * Math.exp(-400 * 0.0015), cx = w.user.x, cy = w.user.y; // (ui/chart.ts: open, then one notch out)
  const W = r.width, H = r.height, toW = (sx, sy) => ({ x: cx + (sx - W / 2) / scale, y: cy - (sy - H / 2) / scale });
  const toS = (x, y) => [W / 2 + (x - cx) * scale, H / 2 - (y - cy) * scale];
  const cv = document.createElement('canvas'); cv.width = W * devicePixelRatio; cv.height = H * devicePixelRatio;
  Object.assign(cv.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: W + 'px', height: H + 'px', pointerEvents: 'none', zIndex: 50 });
  (c.closest('dialog') || c.parentElement).appendChild(cv); const g = cv.getContext('2d'); g.scale(devicePixelRatio, devicePixelRatio);
  const land = p => w.currentAt(p) && (window.__onLand ? window.__onLand(p) : false);
  // the colour scales: Windy's wind ramp (kt), and a current ramp of its own (kt)
  const WIND = [[0, [98, 113, 183]], [4, [57, 97, 159]], [8, [74, 148, 169]], [12, [77, 141, 123]], [16, [83, 165, 83]], [20, [209, 192, 58]], [24, [228, 140, 55]], [28, [212, 72, 63]], [34, [151, 53, 98]], [40, [96, 36, 120]]];
  const CUR = [[0, [40, 60, 90]], [0.5, [52, 120, 170]], [1, [58, 170, 190]], [1.5, [90, 200, 150]], [2, [220, 210, 80]], [3, [235, 130, 50]], [4, [210, 55, 70]], [5, [150, 40, 130]]];
  const ramp = (R, v) => { for (let i = 1; i < R.length; i++) if (v <= R[i][0]) { const t = (v - R[i - 1][0]) / (R[i][0] - R[i - 1][0]), a = R[i - 1][1], b = R[i][1]; return a.map((q, k) => Math.round(q + (b[k] - q) * t)); } return R[R.length - 1][1]; };
  const isWind = kind === 'wind', R = isWind ? WIND : CUR;
  const vec = p => { if (isWind) { const f = w.windHere(p, undefined, false), a = f.from * Math.PI / 180; return { kt: f.kt, ux: -Math.sin(a), uy: -Math.cos(a), from: f.from }; } const v = w.currentAt(p), kt = Math.hypot(v.x, v.y) / 0.5144; return { kt, ux: v.x / (kt * 0.5144 || 1), uy: v.y / (kt * 0.5144 || 1) }; };
  // 1. the speed field: sampled every 12 px, smoothed up (in the build: a low-res canvas redrawn when the view or the
  // minute changes, not every frame)
  const S = 12, nx = Math.ceil(W / S) + 1, ny = Math.ceil(H / S) + 1, small = document.createElement('canvas'); small.width = nx; small.height = ny;
  const sg = small.getContext('2d'), id = sg.createImageData(nx, ny), water = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = toW(i * S, j * S), wet = !window.__onLand(p); water[j * nx + i] = wet ? 1 : 0;
    const v = vec(p), col = ramp(R, v.kt), k = (j * nx + i) * 4;
    id.data[k] = col[0]; id.data[k + 1] = col[1]; id.data[k + 2] = col[2]; id.data[k + 3] = wet ? 150 : 0; // (on the water only: the land keeps the chart's own colours)
  }
  sg.putImageData(id, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(small, -S / 2, -S / 2, nx * S, ny * S);
  // 2. the streaks: particles carried along the flow, each leaving a fading trail (here: one frame of it, 40 steps)
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.lineCap = 'round';
  for (let n = 0; n < (isWind ? 900 : 1100); n++) {
    let sx = rnd() * W, sy = rnd() * H; const pts = [[sx, sy]];
    for (let s = 0; s < 22; s++) { const p = toW(sx, sy); if (window.__onLand(p)) break; const v = vec(p), step = isWind ? 0.55 * v.kt : 6 * v.kt; if (v.kt < (isWind ? 0.5 : 0.08)) break; sx += v.ux * step; sy -= v.uy * step; pts.push([sx, sy]); }
    for (let s = 1; s < pts.length; s++) { g.strokeStyle = `rgba(255,255,255,${0.85 * s / pts.length})`; g.lineWidth = 1.4; g.beginPath(); g.moveTo(pts[s - 1][0], pts[s - 1][1]); g.lineTo(pts[s][0], pts[s][1]); g.stroke(); }
  }
  // 3. the legend: the ramp, labelled in kt
  const ticks = isWind ? [0, 5, 10, 15, 20, 25, 30, 35] : [0, 0.5, 1, 2, 3, 4, 5], max = ticks[ticks.length - 1], LW = 360, LX = W / 2 - LW / 2, LY = H - 40;
  g.fillStyle = 'rgba(9,22,33,.88)'; g.beginPath(); g.roundRect(LX - 10, LY - 30, LW + 20, 58, 8); g.fill();
  g.font = '700 12px "Saira Semi Condensed", sans-serif'; g.fillStyle = '#e9f2f5'; g.textAlign = 'left';
  g.fillText(isWind ? 'WIND SPEED · KT' : 'CURRENT · KT (NOAA tide stations)', LX, LY - 14);
  for (let x = 0; x < LW; x++) { const c2 = ramp(R, x / LW * max); g.fillStyle = `rgb(${c2})`; g.fillRect(LX + x, LY - 6, 1, 12); }
  g.font = '600 11px "Saira Semi Condensed", sans-serif'; g.textAlign = 'center';
  for (const t of ticks) g.fillText(String(t), LX + t / max * LW, LY + 20);
  // 4. the layer picker: big, top left, where the eye goes first
  const tabs = ['Wind', 'Current', 'Waves', 'Fog', 'Off'], on = isWind ? 0 : 1;
  let tx = 16; g.font = '700 14px "Saira Semi Condensed", sans-serif';
  g.fillStyle = 'rgba(9,22,33,.9)'; g.beginPath(); g.roundRect(8, 10, 5 * 92 + 8, 40, 20); g.fill();
  tabs.forEach((t, i) => { if (i === on) { g.fillStyle = '#ffb627'; g.beginPath(); g.roundRect(tx - 4, 14, 88, 32, 16); g.fill(); } g.fillStyle = i === on ? '#0c2534' : '#e9f2f5'; g.textAlign = 'center'; g.fillText(t.toUpperCase(), tx + 40, 35); tx += 92; });
  // 5. the readout under the cursor (a spot off the Golden Gate's mouth, toward Alcatraz)
  const spot = isWind ? { x: cx - 1600, y: cy + 900 } : { x: cx - 2600, y: cy + 400 }, [px, py] = toS(spot.x, spot.y);
  const wv = w.windHere(spot, undefined, false), cu = w.currentAt(spot), ck = Math.hypot(cu.x, cu.y) / 0.5144, cto = (Math.atan2(cu.x, cu.y) * 180 / Math.PI + 360) % 360;
  const tide = cu.x > 0 ? 'flood' : 'ebb'; // (mock-up: east-going is the flood here; the build uses the nearest NOAA station's call, as the dial does)
  const lines = isWind ? [`${Math.round(wv.kt)} kt from ${String(Math.round(wv.from)).padStart(3, '0')}°`, `${tide} ${ck.toFixed(1)} kt toward ${String(Math.round(cto)).padStart(3, '0')}°`]
    : [`${tide} ${ck.toFixed(1)} kt toward ${String(Math.round(cto)).padStart(3, '0')}°`, `wind ${Math.round(wv.kt)} kt from ${String(Math.round(wv.from)).padStart(3, '0')}°`];
  g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.arc(px, py, 7, 0, 7); g.stroke(); g.beginPath(); g.moveTo(px - 12, py); g.lineTo(px + 12, py); g.moveTo(px, py - 12); g.lineTo(px, py + 12); g.stroke();
  g.fillStyle = 'rgba(9,22,33,.92)'; g.beginPath(); g.roundRect(px + 14, py - 52, 230, 52, 8); g.fill();
  g.textAlign = 'left'; g.fillStyle = '#ffffff'; g.font = '700 17px "Saira Semi Condensed", sans-serif'; g.fillText(lines[0], px + 24, py - 30);
  g.fillStyle = '#9fc0cf'; g.font = '600 13px "Saira Semi Condensed", sans-serif'; g.fillText(lines[1], px + 24, py - 11);
  // 6. the label of what this is
  g.font = '700 12px "Saira Semi Condensed", sans-serif'; g.textAlign = 'right'; g.fillStyle = 'rgba(9,22,33,.88)'; g.fillRect(W - 300, H - 62, 290, 20);
  g.fillStyle = '#ffb627'; g.fillText('MOCK-UP · drawn from the sim\'s own fields', W - 18, H - 47);
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  for (const kind of ['wind', 'current']) {
    const p = await b.newPage({ viewport: { width: 1400, height: 860 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(t => { try { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); Object.assign(s, { mode: 'sail', sailFrom: 'cityfront', sailTo: '', windKind: 'west', windKt: 16, tideTime: t }); localStorage.setItem('fbsim-settings-v2', JSON.stringify(s)); } catch {} }, kind === 'wind' ? WIND_T : CUR_T);
    await p.goto('http://localhost:5173/'); await p.waitForTimeout(5000);
    await p.evaluate(() => document.querySelector('[data-home="cruise"]').click()); await p.waitForTimeout(1500);
    await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(5000);
    await p.evaluate(() => document.getElementById('map').click()); await p.waitForTimeout(2000);
    await p.mouse.move(700, 460); await p.mouse.wheel(0, 400); await p.waitForTimeout(2000);
    await p.evaluate(async () => { const m = await import('/src/geo/shore.ts'); window.__onLand = m.onLand; });
    await p.evaluate(overlay, kind); await p.waitForTimeout(300);
    console.log(kind, 'gate', await p.evaluate(() => { const LAT0 = 37.81053, LON0 = -122.44332, M = 111320, q = { x: (-122.4785 - LON0) * M * Math.cos(LAT0 * Math.PI / 180), y: (37.8190 - LAT0) * M }, c = sim().currentAt(q); return (Math.hypot(c.x, c.y) / 0.5144).toFixed(2) + ' kt ' + (c.x > 0 ? 'flood' : 'ebb') + ' ' + sim().raceDate; }));
    await p.screenshot({ path: `${out}/windy-${kind}.png` });
    console.log(kind, 'ERRORS:', errs.join('; ') || 'none'); await p.close();
  }
  await b.close();
})();
