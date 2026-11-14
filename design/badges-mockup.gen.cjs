// Renders the badges proposal: node design/badges-mockup.gen.cjs (writes design/badges-mockup.png)
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  await p.goto('file://' + path.join(__dirname, 'badges-mockup.html'));
  await p.screenshot({ path: path.join(__dirname, 'badges-mockup.png'), fullPage: true });
  await b.close();
})();
