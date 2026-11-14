// Renders the learn-to-sail design sheet: node design/learn-to-sail-mockup.gen.cjs (writes design/learn-to-sail-mockup.png)
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  await p.goto('file://' + path.join(__dirname, 'learn-to-sail-mockup.html'));
  await p.screenshot({ path: path.join(__dirname, 'learn-to-sail-mockup.png'), fullPage: true });
  await b.close();
})();
