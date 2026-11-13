// Renders the rules trainer still: node design/rules-trainer-mockup.gen.cjs (writes design/rules-trainer-mockup.png)
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  await p.goto('file://' + path.join(__dirname, 'rules-trainer-mockup.html'));
  await p.screenshot({ path: path.join(__dirname, 'rules-trainer-mockup.png') });
  await b.close();
})();
