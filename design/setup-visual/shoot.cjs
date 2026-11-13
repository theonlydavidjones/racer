// The visual-first race setup mock-up (the owner: pictures, not copy): the real setup with design/setup-visual/mock.js applied, at desktop
// width; (1) all four folded, (2) the boat and crew open, (3) today's setup for comparison; and a standalone HTML copy.
// Needs the dev server (npm run dev). Usage: node design/setup-visual/shoot.cjs
const pw = require('playwright'), fs = require('fs'), path = require('path');
(async () => {
  const dir = __dirname;
  const b = await pw.chromium.launch({ args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(200000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5173/'); await p.waitForTimeout(4000);
  await p.click('[data-home="race"]'); await p.click('[data-home="create"]'); await p.waitForTimeout(3000);
  await p.screenshot({ path: path.join(dir, '0-today.png') });
  await p.evaluate(src => (0, eval)(src), fs.readFileSync(path.join(dir, 'mock.js'), 'utf8')); await p.waitForTimeout(3000);
  await p.mouse.move(5, 5);
  await p.screenshot({ path: path.join(dir, '1-folded.png') });
  await p.evaluate(() => window.__vfold('boat')); await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(dir, '2-crew-open.png') });
  // a standalone copy: the page's styles, the setup panel as it is now, over a still of the Bay
  await p.evaluate(() => window.__vfold(null)); await p.waitForTimeout(300);
  console.log('crew line:', await p.$eval('#crewSum', e => e.textContent));
  // (the Bay behind: a screenshot with the setup hidden, as WebGL keeps no picture to copy)
  await p.evaluate(() => { document.getElementById('setup').style.visibility = 'hidden'; });
  const bg = 'data:image/jpeg;base64,' + (await p.screenshot({ type: 'jpeg', quality: 60, scale: 'css' })).toString('base64');
  await p.evaluate(() => {
    document.getElementById('setup').style.visibility = '';
    // canvases as pictures, and the inputs' values into the markup, so the copy shows what the page shows
    for (const c of document.querySelectorAll('#setup canvas')) { try { const im = document.createElement('img'); im.src = c.toDataURL(); im.className = c.className; im.id = c.id; im.style.width = c.getBoundingClientRect().width + 'px'; im.style.height = c.getBoundingClientRect().height + 'px'; c.replaceWith(im); } catch { /* */ } }
    for (const i of document.querySelectorAll('#setup input')) i.setAttribute('value', i.value);
    for (const s of document.querySelectorAll('#setup select')) for (const o of s.options) o.toggleAttribute('selected', o.selected);
  });
  const html = await p.evaluate(bg => {
    const css = [...document.styleSheets].map(s => { try { return [...s.cssRules].map(r => r.cssText).join('\n'); } catch { return ''; } }).join('\n');
    const setup = document.getElementById('setup').outerHTML;
    const fonts = [...document.querySelectorAll('link[rel=stylesheet]')].filter(l => /fonts.googleapis/.test(l.href)).map(l => `<link rel="stylesheet" href="${l.href}">`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Visual race setup</title>${fonts}<style>${css}
body{background:#0b1d2a url(${bg}) center/cover no-repeat fixed}</style></head><body class="still">${setup}
<script>for (const s of document.querySelectorAll('#setup .vfold')) s.querySelector('header').onclick = () => { const open = s.classList.contains('open'); document.querySelectorAll('#setup .vfold').forEach(x => { x.classList.remove('open'); x.querySelector('.v-go').textContent = 'Change ▾'; }); if (!open) { s.classList.add('open'); s.querySelector('.v-go').textContent = 'Done ▴'; } };</script></body></html>`;
  }, bg);
  fs.writeFileSync(path.join(dir, 'setup-visual.html'), html);
  console.log('html', Math.round(html.length / 1024), 'KB · errors:', errs.join(' | ') || 'none');
  await b.close();
})();
